import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";

// Vercel function timeout — Hobby plan max is 60s, Pro plan max is 300s.
// The AI analysis pass alone takes 30-60s on complex positions.
// If you're on Vercel Pro, raise this to 300.
export const maxDuration = 60;

// Pin to US East so Anthropic API round-trips are fast.
// Without this Vercel routes to the nearest region (e.g. Sydney) which adds ~250ms per AI call.
export const preferredRegion = "iad1";
import {
  AssetType,
  Chain,
  findKnownAsset,
  findPoolFactory,
  findPoolFactoryByType,
  findProtocolContract,
  findSubgraph,
  findTimelock,
  getPoolChecks,
  PROXY_SLOTS,
  PoolType,
} from "../../lib/registry";
import { findProtocolFlow } from "../../lib/protocol-flows";
import { buildCacheKey, getCached, putCached } from "../../lib/learned-cache";

// Ordered fallback lists — first entry is highest priority.
// If env vars are set they jump to the front; public fallbacks follow.
const RPC_LISTS: Record<Chain, string[]> = {
  ethereum: [
    ...(process.env.ETHEREUM_RPC_URL ? [process.env.ETHEREUM_RPC_URL] : []),
    "https://ethereum-rpc.publicnode.com",
    "https://eth.meowrpc.com",
    "https://eth.lava.build",
    "https://eth.llamarpc.com", // kept as last-resort fallback
  ],
  base: [
    ...(process.env.BASE_RPC_URL ? [process.env.BASE_RPC_URL] : []),
    "https://base-rpc.publicnode.com",
    "https://base.meowrpc.com",
    "https://base.lava.build",
    "https://base-public.nodies.app",
    "https://base.llamarpc.com", // kept as last-resort fallback
  ],
};

const CHAIN_NETWORKS: Record<Chain, { chainId: number; name: string }> = {
  ethereum: { chainId: 1, name: "mainnet" },
  base: { chainId: 8453, name: "base" },
};

/** Build a JsonRpcProvider with a hard 8s timeout on every RPC call.
 *  Uses ethers FetchRequest so the timeout applies to all underlying fetches. */
function makeRpcProvider(url: string, chain: Chain): ethers.JsonRpcProvider {
  const net = CHAIN_NETWORKS[chain];
  const req = new ethers.FetchRequest(url);
  req.timeout = 8000;
  return new ethers.JsonRpcProvider(req, net, { staticNetwork: ethers.Network.from(net) });
}

/** Single provider for the main analysis — uses env var or first public RPC. */
function getProvider(chain: Chain): ethers.JsonRpcProvider {
  return makeRpcProvider(RPC_LISTS[chain][0], chain);
}

/**
 * Hard timeout wrapper for any ethers contract call.
 * ethers FetchRequest.timeout does NOT reliably abort in Vercel's runtime,
 * so we race every contract call against a Promise that rejects after `ms`.
 * Usage: await ct(contract.method()).catch(() => null)
 */
function ct<T>(p: Promise<T>, ms = 4000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("rpc-timeout")), ms)),
  ]);
}

/** Raw JSON-RPC call with a hard AbortSignal timeout — bypasses ethers internals. */
async function rpcCall(url: string, method: string, params: unknown[], timeoutMs = 6000): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json();
  return json.result ?? null;
}

// Raw RPC shapes — only the fields we actually use downstream.
type RawTx = { to: string | null; input: string; hash: string; value?: string };
type RawLog = { address: string; topics: string[]; data: string };
type RawReceipt = { logs: RawLog[] };

/**
 * Fetch a transaction + receipt using raw fetch only (no ethers re-fetch).
 * Downstream code only reads: tx.data, tx.to, receipt.logs[].{address,topics,data}.
 * We map `input` → `data` so the rest of the route doesn't need changes.
 * Tries each RPC sequentially with a 6s hard timeout per attempt.
 */
async function getTransactionWithFallback(txHash: string, chain: Chain) {
  for (const url of RPC_LISTS[chain]) {
    try {
      const [rawTx, rawReceipt] = await Promise.all([
        rpcCall(url, "eth_getTransactionByHash", [txHash]) as Promise<RawTx | null>,
        rpcCall(url, "eth_getTransactionReceipt", [txHash]) as Promise<RawReceipt | null>,
      ]);
      if (rawTx && rawReceipt) {
        // Map raw RPC field `input` → `data` so downstream code is unchanged.
        const tx = { ...rawTx, data: rawTx.input } as unknown as ethers.TransactionResponse;
        const receipt = rawReceipt as unknown as ethers.TransactionReceipt;
        return { tx, receipt };
      }
    } catch {
      // try next RPC
    }
  }
  return { tx: null, receipt: null };
}

/**
 * Decode fee and currency pair from a Uniswap V4 PositionManager transaction.
 *
 * V4 positions are minted via:
 *   PositionManager.multicall([modifyLiquidities(unlockData, deadline)])
 *   unlockData = abi.encode(bytes actions, bytes[] params)
 *   actions[0] = 0x02 (MINT_POSITION)
 *   params[0]  = abi.encode(PoolKey, tickLower, tickUpper, liquidity, ...)
 *   PoolKey    = (currency0, currency1, fee, tickSpacing, hooks)
 *
 * Returns { fee (pips → decimal percent), currency0, currency1 } or null.
 */
function tryDecodeV4PoolKey(txData: string): {
  feePercent: number;
  currency0: string;
  currency1: string;
} | null {
  try {
    const MULTICALL_SEL = "0xac9650d8";
    const MODIFY_LIQ_SEL = "0xdd46508f";
    const MINT_POSITION_ACTION = 0x02;
    const coder = ethers.AbiCoder.defaultAbiCoder();

    // Unwrap multicall if needed
    let calldataBody = txData;
    if (txData.startsWith(MULTICALL_SEL)) {
      const [calls] = coder.decode(["bytes[]"], "0x" + txData.slice(10));
      const found = (calls as string[]).find((c: string) => c.startsWith(MODIFY_LIQ_SEL));
      if (!found) return null;
      calldataBody = found;
    }

    if (!calldataBody.startsWith(MODIFY_LIQ_SEL)) return null;

    // decode modifyLiquidities(bytes unlockData, uint256 deadline)
    const [unlockData] = coder.decode(["bytes", "uint256"], "0x" + calldataBody.slice(10));
    const [actions, params] = coder.decode(["bytes", "bytes[]"], unlockData as string);
    const actionsHex = (actions as string).slice(2);

    // Fix #7: i is a byte offset into the actions bytes, but params[] is indexed by action
    // sequence number. Track them separately so non-trivial action sequences decode correctly.
    let actionIndex = 0;
    for (let i = 0; i < actionsHex.length / 2; i++) {
      const action = parseInt(actionsHex.slice(i * 2, i * 2 + 2), 16);
      const currentIndex = actionIndex++;
      if (action === MINT_POSITION_ACTION) {
        const [poolKey] = coder.decode(
          ["(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)", "int24", "int24", "uint256", "uint128", "uint128", "address", "bytes"],
          (params as string[])[currentIndex]
        );
        const key = poolKey as { currency0: string; currency1: string; fee: bigint };
        return {
          feePercent: Number(key.fee) / 10000,
          currency0: key.currency0.toLowerCase(),
          currency1: key.currency1.toLowerCase(),
        };
      }
    }
  } catch {
    // Not a V4 PositionManager multicall or decode failed — skip silently
  }
  return null;
}

// Etherscan V2 unified API — single endpoint, chainid selects the network
const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";
const CHAIN_IDS: Record<Chain, number> = { ethereum: 1, base: 8453 };

const ETHERSCAN_KEYS: Record<Chain, string> = {
  ethereum: process.env.ETHERSCAN_API_KEY ?? "",
  base: process.env.BASESCAN_API_KEY ?? "",
};

function etherscanUrl(chain: Chain, params: Record<string, string>): string {
  const key = ETHERSCAN_KEYS[chain];
  const qs = new URLSearchParams({ chainid: String(CHAIN_IDS[chain]), ...params, ...(key ? { apikey: key } : {}) });
  return `${ETHERSCAN_V2_API}?${qs}`;
}

type RiskLevel = "critical" | "high" | "medium" | "low" | "info";
type YIFFCategory = "Protocol Security" | "Pool Security" | "Governance & Control" | "Position Economics";

function normalizeCategory(raw: string): YIFFCategory {
  const s = raw.toLowerCase().trim();
  if (s.includes("pool") || s.includes("liquidity") || s.includes("withdrawal") || s.includes("exit")) return "Pool Security";
  if (s.includes("governance") || s.includes("control") || s.includes("admin")) return "Governance & Control";
  if (s.includes("position") || s.includes("economics") || s.includes("market") || s.includes("financial") || s.includes("token risk") || s.includes("yield") || s.includes("impermanent")) return "Position Economics";
  // protocol / smart contract / frontend / phishing / any unmatched → Protocol Security
  return "Protocol Security";
}

type Finding = {
  title: string;
  detail: string;
  level: RiskLevel;
};

type ContractFunctions = {
  trading: string[];
  poolSetup: string[];
  admin: string[];
  read: string[];
};

type ContractRisk = {
  address: string;
  label: string;
  poolType?: string;
  findings: Finding[];
  isProxy?: boolean;
  implementation?: string;
  proxyAdmin?: string;
  functions?: ContractFunctions;
  deployedAt?: number;
  creatorAddress?: string;
  isVerified?: boolean;
  poolReserves?: {
    token0Symbol: string;
    token0Amount: string;
    token1Symbol: string;
    token1Amount: string;
    tvlUsd?: number;
  };
};

type TrustLevel = "trusted" | "caution" | "danger";

type AssetRisk = {
  address: string;
  symbol: string;
  name: string;
  assetType: string;
  trustLevel: TrustLevel;
  riskNotes: string[];
  priceUsd?: number;
};

// ─── Etherscan helpers ───────────────────────────────────────────────────────

async function getABI(address: string, chain: Chain): Promise<string | null> {
  const url = etherscanUrl(chain, { module: "contract", action: "getabi", address });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    if (json.status === "1") return json.result;
    return null;
  } catch {
    return null;
  }
}

async function getContractSource(address: string, chain: Chain): Promise<string | null> {
  const url = etherscanUrl(chain, { module: "contract", action: "getsourcecode", address });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    if (json.status === "1" && json.result[0]?.SourceCode) {
      return json.result[0].SourceCode.slice(0, 8000);
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Contract meta (age + creator) ───────────────────────────────────────────

async function getContractMeta(
  address: string,
  chain: Chain,
): Promise<{ deployedAt?: number; creatorAddress?: string }> {
  // Primary: getcontractcreation (works for most contracts, returns timestamp directly)
  try {
    const url = etherscanUrl(chain, { module: "contract", action: "getcontractcreation", contractaddresses: address });
    const json = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    if (json.status === "1" && json.result?.[0]) {
      const { contractCreator, txHash } = json.result[0] as { contractCreator: string; txHash: string };
      try {
        const txUrl = etherscanUrl(chain, { module: "proxy", action: "eth_getTransactionByHash", txhash: txHash });
        const txJson = await fetch(txUrl, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
        const blockHex = txJson?.result?.blockNumber;
        if (blockHex) {
          const blockUrl = etherscanUrl(chain, { module: "proxy", action: "eth_getBlockByNumber", tag: blockHex, boolean: "false" });
          const blockJson = await fetch(blockUrl, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
          const tsHex = blockJson?.result?.timestamp;
          if (tsHex) return { deployedAt: parseInt(tsHex, 16), creatorAddress: contractCreator };
        }
      } catch { /* ignore */ }
      return { creatorAddress: contractCreator };
    }
  } catch { /* fall through to backup */ }

  // Fallback: txlistinternal gives the CREATE call with timestamp directly
  try {
    const url = etherscanUrl(chain, { module: "account", action: "txlistinternal", address, startblock: "0", endblock: "99999999", page: "1", offset: "1", sort: "asc" });
    const json = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    if (json.status === "1" && json.result?.[0]) {
      const row = json.result[0] as { timeStamp: string; from: string };
      return { deployedAt: Number(row.timeStamp), creatorAddress: row.from };
    }
  } catch { /* ignore */ }

  return {};
}

// ─── Snapshot governance (free public GraphQL — no key needed) ───────────────

// Maps protocol name substrings (lowercase) → Snapshot space ID
const SNAPSHOT_SPACES: Record<string, string> = {
  aerodrome:    "aerodrome.eth",
  velodrome:    "velodrome.eth",
  uniswap:      "uniswapgovernance.eth",
  curve:        "curve.eth",
  balancer:     "balancer.eth",
  sushiswap:    "sushigov.eth",
  pancakeswap:  "cakesnap.eth",
  equalizer:    "equalizer-exchange.eth",
  maverick:     "mav-protocol.eth",
  aave:         "aave.eth",
  compound:     "comp-vote.eth",
};

type GovernanceProposal = {
  id: string;
  title: string;
  endsAt: number;   // unix timestamp
  url: string;
};

async function getActiveProposals(protocol: string | undefined): Promise<GovernanceProposal[]> {
  if (!protocol) return [];
  const key = Object.keys(SNAPSHOT_SPACES).find((k) => protocol.toLowerCase().includes(k));
  if (!key) return [];
  const space = SNAPSHOT_SPACES[key];

  const query = `{
    proposals(
      first: 5
      where: { space_in: ["${space}"], state: "active" }
      orderBy: "end"
      orderDirection: asc
    ) {
      id title end
    }
  }`;

  try {
    const res = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json() as { data?: { proposals?: { id: string; title: string; end: number }[] } };
    const proposals = json?.data?.proposals ?? [];
    return proposals.map((p) => ({
      id: p.id,
      title: p.title,
      endsAt: p.end,
      url: `https://snapshot.org/#/${space}/proposal/${p.id}`,
    }));
  } catch {
    return [];
  }
}

// ─── Exploit history (DeFiLlama Hacks API — free, no key needed) ────────────

type DLHack = {
  date: number;       // unix timestamp (seconds)
  name: string;
  amount: number;     // USD
  technique?: string;
  category?: string;
  link?: string;
};

type ExploitEntry = {
  date: string;
  amountUsd?: number;
  title: string;
  description: string;
  url?: string;
};

async function getProtocolExploits(protocol: string): Promise<ExploitEntry[]> {
  if (!protocol) return [];
  try {
    const res = await fetch("https://api.llama.fi/hacks", {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const hacks = await res.json() as DLHack[];
    const needle = protocol.toLowerCase().replace(/\s+/g, "");
    return hacks
      .filter((h) => {
        const name = h.name.toLowerCase().replace(/\s+/g, "");
        return name.includes(needle) || needle.includes(name);
      })
      .map((h) => ({
        date: new Date(h.date * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        amountUsd: h.amount,
        title: `${h.name} exploit`,
        description: h.technique ? `${h.technique}.` : "Details not disclosed.",
        url: h.link ?? undefined,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
}

function mergeExploits(aiExploits: ExploitEntry[], llamaExploits: ExploitEntry[]): ExploitEntry[] {
  const seen = new Set<string>();
  const out: ExploitEntry[] = [];
  // DefiLlama entries are ground-truth — prefer them; AI fills gaps
  for (const e of [...llamaExploits, ...aiExploits]) {
    const key = (e.date + "|" + e.title.toLowerCase()).slice(0, 40);
    if (!seen.has(key)) { seen.add(key); out.push(e); }
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Token prices (DeFiLlama Coins API — free, no key needed) ────────────────

async function getTokenPrices(addresses: string[], chain: Chain): Promise<Record<string, number>> {
  if (addresses.length === 0) return {};
  const prefix = chain === "base" ? "base" : "ethereum";
  const ids = addresses.map((a) => `${prefix}:${a.toLowerCase()}`).join(",");
  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${ids}`, {
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json() as { coins?: Record<string, { price?: number }> };
    const out: Record<string, number> = {};
    for (const [key, val] of Object.entries(json.coins ?? {})) {
      const addr = key.split(":")[1];
      if (addr && val.price !== undefined) out[addr.toLowerCase()] = val.price;
    }
    return out;
  } catch {
    return {};
  }
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })}B`;
  if (n >= 1e6) return `$${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// ─── Pool reserves ────────────────────────────────────────────────────────────

function fmtReserve(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

// Try fetching reserves from The Graph subgraph — more reliable than public RPC.
// Returns raw floats (not formatted) so getPoolReserves can compute TVL.
// Returns null if no API key, no subgraph match, or the request fails.
async function getReservesFromSubgraph(
  poolAddress: string,
  protocol: string | undefined,
  chain: Chain,
): Promise<{ r0: number; r1: number } | null> {
  const apiKey = process.env.THEGRAPH_API_KEY;
  if (!apiKey || !protocol) return null;

  const subgraph = findSubgraph(protocol, chain);
  if (!subgraph) return null;

  const url = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraph.subgraphId}`;
  const isTVL = subgraph.reserveField === "totalValueLockedToken0/totalValueLockedToken1";

  const query = isTVL
    ? `{ pool(id: "${poolAddress.toLowerCase()}") { totalValueLockedToken0 totalValueLockedToken1 } }`
    : `{ pool(id: "${poolAddress.toLowerCase()}") { reserve0 reserve1 } }`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    const pool = json?.data?.pool;
    if (!pool) return null;

    const r0 = isTVL ? parseFloat(pool.totalValueLockedToken0) : parseFloat(pool.reserve0);
    const r1 = isTVL ? parseFloat(pool.totalValueLockedToken1) : parseFloat(pool.reserve1);
    if (isNaN(r0) || isNaN(r1)) return null;

    console.log(`[subgraph] reserves for ${poolAddress.slice(0, 8)}: ${r0} / ${r1}`);
    return { r0, r1 };
  } catch {
    return null;
  }
}

async function getPoolReserves(
  poolAddress: string,
  pair: { token0: string; token1: string; token0Symbol: string; token1Symbol: string },
  chain: Chain,
  _provider: ethers.AbstractProvider,
  protocol?: string,
): Promise<ContractRisk["poolReserves"]> {
  // Fetch token prices in parallel with reserves (DeFiLlama — free, no key)
  const [prices, subgraphRaw] = await Promise.all([
    getTokenPrices([pair.token0, pair.token1], chain),
    getReservesFromSubgraph(poolAddress, protocol, chain),
  ]);

  let rawR0: number | undefined;
  let rawR1: number | undefined;

  if (subgraphRaw) {
    rawR0 = subgraphRaw.r0;
    rawR1 = subgraphRaw.r1;
  } else {
    // Fall back to RPC balanceOf calls
    const freshProvider = getProvider(chain);
    const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];

    const fetchBalance = async (tokenAddr: string): Promise<{ balance: bigint; decimals: number } | null> => {
      const known = findKnownAsset(tokenAddr, chain);
      const token = new ethers.Contract(tokenAddr, erc20Abi, freshProvider);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
          const balance: bigint = await token.balanceOf(poolAddress);
          const dec = known?.decimals ?? Number(await token.decimals().catch(() => 18));
          return { balance, decimals: dec };
        } catch { /* retry */ }
      }
      return null;
    };

    const r0 = await fetchBalance(pair.token0);
    const r1 = await fetchBalance(pair.token1);
    if (r0 && r1) {
      rawR0 = Number(ethers.formatUnits(r0.balance, r0.decimals));
      rawR1 = Number(ethers.formatUnits(r1.balance, r1.decimals));
    }
  }

  if (rawR0 === undefined || rawR1 === undefined) return undefined;

  const price0 = prices[pair.token0.toLowerCase()] ?? 0;
  const price1 = prices[pair.token1.toLowerCase()] ?? 0;
  const tvlUsd = (price0 > 0 || price1 > 0) ? rawR0 * price0 + rawR1 * price1 : undefined;

  if (tvlUsd !== undefined) {
    console.log(`[tvl] ${pair.token0Symbol}/${pair.token1Symbol}: ${fmtUsd(tvlUsd)} (p0=$${price0} p1=$${price1})`);
  }

  return {
    token0Symbol: pair.token0Symbol,
    token0Amount: fmtReserve(rawR0),
    token1Symbol: pair.token1Symbol,
    token1Amount: fmtReserve(rawR1),
    tvlUsd,
  };
}

// ─── Proxy detection ─────────────────────────────────────────────────────────

async function detectProxy(
  address: string,
  provider: ethers.AbstractProvider
): Promise<{ isProxy: boolean; implementation?: string; admin?: string }> {
  try {
    const implSlot = await provider.getStorage(address, PROXY_SLOTS.implementation);
    const adminSlot = await provider.getStorage(address, PROXY_SLOTS.admin);

    const impl = implSlot !== ethers.ZeroHash
      ? "0x" + implSlot.slice(-40)
      : undefined;
    const admin = adminSlot !== ethers.ZeroHash
      ? "0x" + adminSlot.slice(-40)
      : undefined;

    return { isProxy: !!impl && impl !== "0x" + "0".repeat(40), implementation: impl, admin };
  } catch {
    return { isProxy: false };
  }
}

// ─── Contract state reader ────────────────────────────────────────────────────

async function readContractState(
  address: string,
  abi: string,
  provider: ethers.AbstractProvider,
  poolType: PoolType
): Promise<Finding[]> {
  const findings: Finding[] = [];
  let parsedAbi: ethers.InterfaceAbi;

  try {
    parsedAbi = JSON.parse(abi);
  } catch {
    return findings;
  }

  const contract = new ethers.Contract(address, parsedAbi, provider);
  const checks = getPoolChecks(poolType);

  for (const check of checks) {
    try {
      const result = await contract[check.functionName]();
      const valueStr = result?.toString() ?? "";

      if (check.functionName === "is_killed" && result === true) {
        findings.push({ title: "Pool is killed", detail: check.riskIfTrue ?? check.description, level: "critical" });
      } else if (check.functionName === "isAlive" && result === false) {
        findings.push({ title: "Gauge is dead", detail: check.riskIfFalse ?? check.description, level: "critical" });
      } else if (check.functionName === "future_A") {
        const currentA = await contract["A"]().catch(() => null);
        if (currentA && result.toString() !== currentA.toString()) {
          findings.push({
            title: "A parameter ramp in progress",
            detail: `A is changing from ${currentA} → ${result}. This affects pool pricing mechanics.`,
            level: "high",
          });
        }
      } else if ((check.functionName === "owner" || check.functionName === "getOwner") && valueStr && valueStr !== ethers.ZeroAddress) {
        const code = await provider.getCode(valueStr).catch(() => "0x");
        const isEOA = code === "0x";
        const timelock = findTimelock(valueStr, "ethereum") ?? findTimelock(valueStr, "base");

        if (isEOA) {
          findings.push({
            title: "Admin key is an EOA",
            detail: `Owner ${valueStr.slice(0, 10)}... is a plain wallet, not a multisig or timelock. Highest centralisation risk.`,
            level: "critical",
          });
        } else if (timelock) {
          findings.push({
            title: `Owner is a timelock (${timelock.protocol})`,
            detail: `Delay: ${timelock.delaySeconds / 3600}h. Changes must be queued. some protection for users.`,
            level: "low",
          });
        } else {
          const ms = await getMultisigInfo(valueStr, provider);
          if (ms) {
            const level = multisigRiskLevel(ms.threshold, ms.signers);
            findings.push({
              title: `Owner is a ${ms.threshold}-of-${ms.signers} multisig (Gnosis Safe)`,
              detail: `Owner ${valueStr.slice(0, 10)}... is a Gnosis Safe requiring ${ms.threshold} of ${ms.signers} signers.${
                ms.threshold === 1 ? " WARNING: 1-of-N means any single signer can act alone." :
                ms.threshold / ms.signers >= 0.6 ? " Majority quorum required — solid protection." :
                " Minority quorum — fewer than half the signers can push changes."
              }`,
              level,
            });
          } else {
            findings.push({
              title: "Admin key is a contract",
              detail: `Owner is a contract at ${valueStr.slice(0, 10)}.... could not confirm as Gnosis Safe — may be a DAO, custom multisig, or unknown contract.`,
              level: "medium",
            });
          }
        }
      } else if (check.functionName === "getPausedState") {
        const paused = result?.paused ?? result;
        if (paused === true) {
          findings.push({ title: "Pool is paused", detail: "No swaps or joins are currently possible.", level: "critical" });
        }
      } else if (valueStr && check.riskIfTrue) {
        findings.push({ title: check.description, detail: `Value: ${valueStr}. ${check.riskIfTrue}`, level: "medium" });
      }
    } catch {
      // Function may not exist on this contract. skip silently
    }
  }

  return findings;
}

// ─── Multisig inspector (Gnosis Safe standard interface) ─────────────────────

const GNOSIS_SAFE_ABI = [
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
];

async function getMultisigInfo(
  address: string,
  provider: ethers.AbstractProvider,
): Promise<{ signers: number; threshold: number } | null> {
  try {
    const safe = new ethers.Contract(address, GNOSIS_SAFE_ABI, provider);
    const [owners, threshold] = await Promise.all([
      safe.getOwners(),
      safe.getThreshold(),
    ]);
    if (Array.isArray(owners) && owners.length > 0) {
      return { signers: owners.length, threshold: Number(threshold) };
    }
  } catch {
    // Not a Gnosis Safe or call failed — fall through
  }
  return null;
}

function multisigRiskLevel(threshold: number, signers: number): RiskLevel {
  if (threshold === 1) return "high";           // 1-of-N = effectively a single key
  const ratio = threshold / signers;
  if (ratio >= 0.6) return "low";               // majority required — solid
  if (ratio >= 0.4) return "medium";            // minority can sign — watch it
  return "high";                                // <40% quorum — weak multisig
}

// ─── Universal admin / ownership checks (run on every contract) ─────────────

const UNIVERSAL_ADMIN_ABI = [
  "function owner() view returns (address)",
  "function getOwner() view returns (address)",
  "function admin() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function paused() view returns (bool)",
];

async function runUniversalAdminChecks(
  address: string,
  provider: ethers.AbstractProvider,
  chain: Chain
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const contract = new ethers.Contract(address, UNIVERSAL_ADMIN_ABI, provider);

  // Try to resolve "who controls this contract" via owner() / getOwner() / admin()
  let adminAddr: string | null = null;
  let adminSource = "";
  for (const fn of ["owner", "getOwner", "admin"] as const) {
    try {
      const result: string = await contract[fn]();
      if (result && result !== ethers.ZeroAddress) {
        adminAddr = result;
        adminSource = fn;
        break;
      }
    } catch {
      // function doesn't exist on this contract. try next
    }
  }

  if (adminAddr) {
    const code = await provider.getCode(adminAddr).catch(() => "0x");
    const isEOA = code === "0x";
    const timelock = findTimelock(adminAddr, chain);

    if (timelock) {
      findings.push({
        title: `Admin is a timelock (${timelock.protocol})`,
        detail: `${adminSource}() = ${adminAddr.slice(0, 10)}.... delay ${timelock.delaySeconds / 3600}h. Changes must be queued, giving users time to exit.`,
        level: "low",
      });
    } else if (isEOA) {
      findings.push({
        title: "Admin is an EOA (single wallet)",
        detail: `${adminSource}() = ${adminAddr.slice(0, 10)}... is a plain wallet, not a multisig or timelock. Highest centralisation risk. that one wallet can change contract behaviour instantly.`,
        level: "critical",
      });
    } else {
      const ms = await getMultisigInfo(adminAddr, provider);
      if (ms) {
        const level = multisigRiskLevel(ms.threshold, ms.signers);
        findings.push({
          title: `Admin is a ${ms.threshold}-of-${ms.signers} multisig (Gnosis Safe)`,
          detail: `${adminSource}() = ${adminAddr.slice(0, 10)}... is a Gnosis Safe requiring ${ms.threshold} of ${ms.signers} signers to execute changes.${
            ms.threshold === 1
              ? " WARNING: 1-of-N threshold means any single signer can act unilaterally."
              : ms.threshold / ms.signers >= 0.6
              ? " Strong quorum — a majority of keyholders must agree."
              : " Minority quorum — a small subset of keyholders can push changes."
          }`,
          level,
        });
      } else {
        findings.push({
          title: "Admin is a contract (multisig / DAO / unknown)",
          detail: `${adminSource}() = ${adminAddr.slice(0, 10)}... is a contract. Could not confirm as a Gnosis Safe — may be a DAO governor, custom multisig, or another contract.`,
          level: "medium",
        });
      }
    }
  }

  // Pending ownership transfer
  try {
    const pending: string = await ct(contract.pendingOwner());
    if (pending && pending !== ethers.ZeroAddress) {
      findings.push({
        title: "Pending ownership transfer",
        detail: `pendingOwner() = ${pending.slice(0, 10)}.... a transfer of control is queued and awaiting acceptance.`,
        level: "high",
      });
    }
  } catch {
    // no pendingOwner. fine
  }

  // Paused state
  try {
    const isPaused: boolean = await ct(contract.paused());
    if (isPaused === true) {
      findings.push({
        title: "Contract is currently paused",
        detail: "paused() = true. interactions are currently disabled. Existing positions may be stuck until admin unpauses.",
        level: "critical",
      });
    }
  } catch {
    // no paused(). fine
  }

  return findings;
}

// ─── Pool type auto-detection (for unknown pool addresses) ───────────────────

const POOL_AUTODETECT_ABI = [
  "function factory() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

// Resolve a token address to its symbol. checks the static registry first,
// then falls back to reading symbol() on chain.
async function resolveTokenSymbol(
  address: string,
  chain: Chain,
  provider: ethers.AbstractProvider
): Promise<string> {
  const known = findKnownAsset(address, chain);
  if (known) return known.symbol;
  try {
    const c = new ethers.Contract(address, ["function symbol() view returns (string)"], provider);
    const sym = await ct(c.symbol());
    if (sym && typeof sym === "string") return sym;
  } catch {
    // ignore
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function describeTickSpacing(ts: number): string {
  if (ts <= 1) return "very narrow tick spacing. designed for tightly-pegged stable pairs";
  if (ts <= 10) return "narrow tick spacing. designed for stable pairs (e.g. USDC/USDT)";
  if (ts <= 60) return "medium tick spacing. typical for blue-chip pairs (e.g. ETH/USDC)";
  if (ts <= 200) return "wide tick spacing. typical for volatile pairs";
  return "very wide tick spacing. typical for highly volatile pairs";
}

async function autoDetectPoolType(
  address: string,
  provider: ethers.AbstractProvider,
  chain: Chain
): Promise<{
  poolType: PoolType;
  label?: string;
  findings: Finding[];
  pair?: { token0Symbol: string; token1Symbol: string; token0: string; token1: string };
  feePercent?: number;
}> {
  const findings: Finding[] = [];
  const contract = new ethers.Contract(address, POOL_AUTODETECT_ABI, provider);

  // Read all pool state in parallel — ct() enforces a 4s hard timeout per call
  // so a hung RPC never blocks the whole analysis.
  const [factoryAddr, tickSpacing, fee, token0, token1] = await Promise.all([
    ct(contract.factory()).catch(() => null),
    ct(contract.tickSpacing()).catch(() => null),
    ct(contract.fee()).catch(() => null),
    ct(contract.token0()).catch(() => null),
    ct(contract.token1()).catch(() => null),
  ]);

  const knownFactory = factoryAddr ? findPoolFactory(factoryAddr as string, chain) : null;

  let pair:
    | { token0Symbol: string; token1Symbol: string; token0: string; token1: string }
    | undefined;
  if (token0 && token1) {
    const [s0, s1] = await Promise.all([
      resolveTokenSymbol(token0, chain, provider),
      resolveTokenSymbol(token1, chain, provider),
    ]);
    pair = { token0Symbol: s0, token1Symbol: s1, token0, token1 };
    findings.push({
      title: `Pool pair: ${s0} ↔ ${s1}`,
      detail: `This pool swaps between ${s0} and ${s1}. Your LP position holds a mix of both depending on the price.`,
      level: "info",
    });
  }

  // If we couldn't identify the factory, return unknown but still include pair + fee
  if (!knownFactory) {
    const earlyFee = fee !== null ? Number(fee) / 10000 : undefined;
    return { poolType: "unknown", findings, pair, feePercent: earlyFee };
  }

  let feePercent: number | undefined;
  if (fee !== null) {
    feePercent = Number(fee) / 10000;
    findings.push({
      title: `Fee tier: ${feePercent}%`,
      detail:
        feePercent <= 0.05
          ? `${feePercent}% fee. lowest tier, used for tightly correlated assets like stablecoin pairs or ETH/wrapped-ETH. Earns less per swap; only viable with high volume.`
          : feePercent <= 0.3
            ? `${feePercent}% fee. standard tier for major pairs.`
            : `${feePercent}% fee. high tier, typical for exotic or low-liquidity pairs.`,
      level: "info",
    });
  }

  if (tickSpacing !== null) {
    findings.push({
      title: `Price-range setting`,
      detail: `${describeTickSpacing(Number(tickSpacing))}. (technical: tickSpacing=${tickSpacing})`,
      level: "info",
    });
  }

  return {
    poolType: knownFactory.poolType,
    label: `${knownFactory.name} pool`,
    findings,
    pair,
    feePercent,
  };
}

// ─── Function categorizer ────────────────────────────────────────────────────

const TRADING_PREFIXES = ["swap", "mint", "burn", "collect", "flash", "deposit", "withdraw", "stake", "unstake", "claim", "harvest", "transfer", "addliquidity", "removeliquidity", "multicall", "exactinput", "exactoutput"];
// Security-critical admin functions: can pause, kill, upgrade the contract, or transfer control
const ADMIN_PREFIXES = ["pause", "unpause", "kill", "upgrade", "grant", "revoke", "renounce", "transferownership", "setowner", "setadmin", "setgovernor"];
// Pool/protocol configuration functions: change parameters but don't change who controls the contract
const POOL_SETUP_PREFIXES = ["set", "update", "change", "initialize", "sync", "create", "add", "remove", "register", "deploy", "increase", "decrease", "enable", "disable", "notify"];

function categorizeFunctions(abi: string): ContractFunctions {
  try {
    const parsed: { type: string; name?: string; stateMutability?: string }[] = JSON.parse(abi);
    const fns = parsed.filter((item) => item.type === "function" && item.name);
    const trading: string[] = [], poolSetup: string[] = [], admin: string[] = [], read: string[] = [];
    for (const fn of fns) {
      const name = fn.name!;
      const lower = name.toLowerCase();
      if (fn.stateMutability === "view" || fn.stateMutability === "pure") {
        read.push(name);
      } else if (TRADING_PREFIXES.some((t) => lower.startsWith(t))) {
        trading.push(name);
      } else if (ADMIN_PREFIXES.some((a) => lower.startsWith(a) || lower === a)) {
        admin.push(name);
      } else if (POOL_SETUP_PREFIXES.some((p) => lower.startsWith(p))) {
        poolSetup.push(name);
      } else {
        poolSetup.push(name);
      }
    }
    return { trading, poolSetup, admin, read };
  } catch {
    return { trading: [], poolSetup: [], admin: [], read: [] };
  }
}

// ─── AI analysis ─────────────────────────────────────────────────────────────

async function runAIAnalysis(context: {
  txHash: string;
  chain: string;
  contracts: ContractRisk[];
  assets: AssetRisk[];
  sourceSnippets: Record<string, string>;
  nftPriceRange?: { lower: number; upper: number; token0Symbol?: string; token1Symbol?: string };
  customAbis?: Array<{ address: string; abi: string }>;
}): Promise<{
  narrative: string;
  overallRisk: RiskLevel;
  stackedRisks: string[];
  sources: { title: string; url: string }[];
  vulnerabilityChecks: {
    category: "Protocol Security" | "Pool Security" | "Governance & Control" | "Position Economics";
    title: string;
    severity: RiskLevel;
    finding: string;
    info: string;
    laymanTerms: string;
    learnMoreUrl?: string;
  }[];
  scenariosThatCanGoWrong: {
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    icon: string;
  }[];
  howToProtectYourself: string[];
  audits: {
    auditor: string;
    date: string;
    highestSeverity: "critical" | "high" | "medium" | "low" | "none";
    notes: string;
    url?: string;
  }[];
  exploits: {
    date: string;
    amountUsd?: number;
    title: string;
    description: string;
    url?: string;
  }[];
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      narrative: "AI analysis skipped. ANTHROPIC_API_KEY not set in .env.local. Restart the dev server after adding it.",
      overallRisk: "medium",
      stackedRisks: [],
      sources: [],
      vulnerabilityChecks: [],
      scenariosThatCanGoWrong: [],
      howToProtectYourself: [],
      audits: [],
      exploits: [],
    };
  }
  const client = new Anthropic({ apiKey });

  const explorerBase = context.chain === "base" ? "https://basescan.org" : "https://etherscan.io";

  const prompt = `You are a DeFi security analyst. A user deposited into a yield farming position. Analyse the on-chain data below using your training knowledge of DeFi protocols, audits, and exploit history.

CRITICAL RULES:
- Do NOT call canonical tokens (USDC, WETH, DAI, USDT, cbETH, wstETH) "fake" or "shadow". they are real tokens. Verify via Basescan/Etherscan if uncertain.
- If a contract is labelled as a known protocol contract in the data (router, position manager, factory, gauge), trust that label and confirm via Basescan.
- Do NOT speculate. If web research turns up nothing about a contract, say "could not verify this contract via public sources" rather than guessing.
- Focus on what your RESEARCH + the on-chain DATA actually shows.
- NEVER contradict yourself. If you say a contract is verified in one check, do not flag it as unverified in another. If you say a protocol has no known exploits, do not mention an exploit elsewhere unless you found concrete evidence for it.
- Every claim in vulnerabilityChecks must be consistent with the narrative and with every other check. Read your own output before finalising — if two checks contradict each other, merge or remove one.

Transaction: ${context.txHash}
Chain: ${context.chain}
Block explorer for this chain: ${explorerBase}
${context.nftPriceRange ? `NFT POSITION PRICE RANGE (read directly from on-chain positions() call — use this exact range, do NOT substitute your own): $${context.nftPriceRange.lower.toLocaleString()} - $${context.nftPriceRange.upper.toLocaleString()} ${context.nftPriceRange.token1Symbol ?? "USDC"} per ${context.nftPriceRange.token0Symbol ?? "ETH"}` : ""}

CONTRACTS TOUCHED (with on-chain findings already extracted):
${JSON.stringify(context.contracts, null, 2)}

ASSETS IN POSITION (already extracted):
${JSON.stringify(context.assets, null, 2)}

SOURCE CODE WAS FETCHED FOR: ${Object.keys(context.sourceSnippets).join(", ") || "no contracts"}
${Object.entries(context.sourceSnippets).map(([addr, src]) => {
  // Fix #1: strip Solidity comments before interpolating source into the prompt.
  // A malicious contract deployer can embed "IGNORE PRIOR INSTRUCTIONS" in a comment.
  // Removing all // and /* */ comments eliminates that injection vector.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
    .replace(/\/\/[^\n]*/g, "")           // line comments
    .replace(/\s+/g, " ")                 // collapse whitespace
    .trim()
    .slice(0, 600);
  return `\n--- ${addr} ---\n${stripped}`;
}).join("\n")}

Your final response must be ONLY a JSON object (no prose around it) in this exact schema. Do NOT copy or reuse the placeholder text below — every field must come from your analysis of this specific transaction.

{
  "vulnerabilityChecks": [
    {
      "category": "Protocol Security | Pool Security | Governance & Control | Position Economics",
      "title": "Short descriptive title",
      "severity": "critical | high | medium | low | info",
      "finding": "One scannable line under 70 chars — what you found",
      "info": "1-2 sentences: what you found AND the practical risk to the yield farmer",
      "learnMoreUrl": "stable reference URL — only include for high or critical severity findings"
    }
  ],
  "narrative": "3-4 sentence plain-English risk summary based on your research",
  "overallRisk": "critical | high | medium | low",
  "stackedRisks": ["compounding risk 1", "compounding risk 2"],
  "sources": [
    { "title": "Actual page title you fetched", "url": "https://..." }
  ],
  "audits": [
    {
      "auditor": "Name of the audit firm (e.g. Trail of Bits, OpenZeppelin, Certik, Peckshield)",
      "date": "Month and year or year only (e.g. Oct 2023 or 2023)",
      "highestSeverity": "critical | high | medium | low | none",
      "notes": "One sentence: what was found or 'No critical issues found'",
      "url": "Direct URL to the audit report PDF or GitHub page — only include if you actually found it"
    }
  ],
  "exploits": [
    {
      "date": "Month Year (e.g. Jun 2023)",
      "amountUsd": 1500000,
      "title": "Short exploit name (e.g. Curve Finance re-entrancy attack)",
      "description": "1-2 sentences: what happened and how funds were lost",
      "url": "Link to post-mortem, rekt.news, or DeFiLlama hacks page — only if you actually found it"
    }
  ],
  "scenariosThatCanGoWrong": [
    {
      "title": "Short scenario name (under 6 words)",
      "description": "1-2 sentences explaining what happens and why",
      "impact": "high | medium | low",
      "icon": "single emoji"
    }
  ],
  "howToProtectYourself": [
    "Imperative sentence starting with a verb, specific and actionable"
  ]
}

${(context.customAbis ?? []).length > 0 ? `
USER-PROVIDED CONTRACT ABIs — ANALYSE THESE CAREFULLY:
The user manually pasted the following ABIs because these tokens/contracts have non-standard or unusual function names that automated tools cannot handle. This is a red flag in itself — ordinary well-audited tokens do not need this.

${(context.customAbis ?? []).map((ca) => {
  // Parse and summarise the ABI — extract function names + state mutability
  let parsed: Array<{ type: string; name?: string; stateMutability?: string; inputs?: Array<{ type: string; name: string }> }> = [];
  try { parsed = JSON.parse(ca.abi); } catch { /* raw string */ }
  const functions = parsed.filter(x => x.type === "function").map(x =>
    `${x.name}(${(x.inputs ?? []).map(i => i.type).join(",")}) [${x.stateMutability ?? "nonpayable"}]`
  );
  return `Contract ${ca.address}:
Functions: ${functions.length > 0 ? functions.join(", ") : "(could not parse — raw ABI provided below)"}
${functions.length === 0 ? ca.abi.slice(0, 2000) : ""}`;
}).join("\n\n")}

For EACH user-provided ABI above, you MUST add a dedicated vulnerability check to vulnerabilityChecks:
- category: "Protocol Security"
- title: "Custom ABI Analysis: <short address e.g. 0x1234…abcd>"
- Analyze for:
  1. Tax/fee-on-transfer: look for functions that intercept or tax transfers (e.g. _transfer overrides, fee variables, excludeFromFee, setTaxFee)
  2. Owner drain/rug: functions like withdrawAll, drain, sweep, rescueTokens, or anything that moves user funds to an owner address
  3. Hidden mint: mint() or similar functions callable by a single owner without a cap
  4. Blacklist/freeze: blacklist, ban, addToBlacklist, lockAccount, freeze — can block a specific user from selling
  5. Honeypot patterns: functions that make buying possible but block selling (setMaxSellAmount(0), trading booleans, restricted _transfer)
  6. Non-standard names masking standard calls: e.g. "airdrop" that actually mints, or "distribute" that drains a balance
- severity: "critical" if honeypot/rug drain present, "high" if mint/blacklist without timelock, "medium" if suspicious owner controls, "low" if non-standard but benign
- finding: summarise the most important finding in one line
- laymanTerms: explain in plain English with a real-world analogy (e.g. "Think of this like a vending machine that lets you put money in but jams when you try to get change back.")
` : ""}
MANDATORY CHECKLIST. Every item below MUST produce at least one entry in vulnerabilityChecks — even if the result is clean. A clean finding is severity "low". Context-only is severity "info". Do NOT skip any item. The user sees what was checked: a green "low concern" row is just as important to them as a red "critical" row. An empty or short vulnerabilityChecks array is a FAILURE of this task.

A) Protocol Security — produce ONE check per bullet:
   1. Source Verification — are the core contracts verified on the block explorer? (low = verified, high = unverified)
   2. Audit Status — audited? by whom? when? Search GitHub ("<protocol> audit"), Immunefi, and the protocol's own docs. Populate the top-level "audits" array. (low = audited with no critical findings, high = unaudited or critical open issues)
   3. Proxy / Upgrade Risk — are core contracts behind upgradeable proxies? who controls upgrades? (low = immutable or DAO-timelocked, high = EOA-upgradeable)
   4. Bug Bounty — does the protocol run a bug bounty on Immunefi? max payout? (low = active bounty, medium = none)
   5. Exploit History — any past exploits? Search rekt.news and DeFiLlama hacks. Populate "exploits" array. (low = clean record, high/critical = prior exploits)
   6. Factory / Contract Maturity — when was the factory deployed? (low = 1+ year, medium = under 6 months)

B) Pool Security — produce ONE check per bullet:
   7. Pool Maturity & Liquidity — when was THIS pool deployed? current TVL? (low = mature and deep, medium = new or shallow)
   8. Kill Switch / Pause — can this pool be paused or killed by an admin? (low = not killable, medium = killable with timelock, high = killable by single wallet)
   9. Withdrawal / Exit — any locks, delays, queues, or penalties on exiting? (low = no locks, high = locked)

C) Governance & Control — produce ONE check per bullet:
   10. Admin Access — EOA, multisig, timelock, or DAO? What can they actually change? (low = DAO/timelock, medium = multisig, high = EOA)
   11. Oracle Dependency — does this pool rely on a price oracle? (low = no oracle or uses TWAP, medium = single Chainlink feed, high = manipulable oracle)
   12. Network / Chain Security — L1, native L2 (OP/ARB), or scaling L2? Any sequencer centralisation? (info for L1, low for native L2, medium for newer L2s)
   13. Team — known and reputable / anon / unknown / bad rep (low = known team, medium = anon, high = red flags)
   14. Frontend / Phishing Risk — DNS hijack history, drainer incidents. Max severity "medium". (low = no incidents, medium = prior incident)

D) Position Economics — produce ONE check per bullet:
   15. Token Risk — one row per token in the position. freeze/blacklist/mint risk. (low = canonical token, medium = unknown or new token)
   16. Impermanent Loss Exposure — always severity "info". How much could the pair diverge?
   17. MEV / Sandwich Risk — (for concentrated liquidity) are rebalance txs sandwichable? (low = minimal, medium = meaningful risk)
   18. Yield Source — always severity "info". What is yield denominated in, is it sustainable?
   19. Bridge / Cross-chain Risk — ONLY if bridged assets are in the position. (low = native bridge, medium = third-party bridge)

SCENARIOS THAT CAN GO WRONG:
Give 3 to 5 specific, concrete things that could realistically go wrong with THIS position. Each scenario must be:
- "title": short scenario name (under 6 words), no jargon
- "description": 1-2 sentences in plain English explaining what happens and why
- "impact": "high" / "medium" / "low". what it would cost the user if it happens
- "icon": a single emoji that fits visually (📉 for price moves, 🎣 for phishing, 🧊 for liquidity dry-up, 🔒 for admin action, 🌉 for bridge issues, etc)
Pull from the most likely failure modes for this specific protocol/pair, not generic DeFi risks. Make them feel personal to the user's actual position.

HOW TO PROTECT YOURSELF:
Give 3 to 5 specific, actionable things the user can do right now to mitigate the risks above. Each must be:
- A short imperative sentence (start with a verb)
- Concrete and doable (not "be careful" or "do your own research")
- Tied to the actual scenarios above where possible
Examples: "Bookmark aerodrome.finance and only access from the bookmark." "Set a price alert for when WETH exits your range." "Stake the LP NFT in the gauge to capture AERO emissions."

CANONICAL ASSET TONE GUIDANCE:
For canonical, well-established assets issued by reputable issuers (USDC by Circle, USDT by Tether, DAI by MakerDAO/Sky, GHO by Aave, WETH/wstETH/cbETH on their canonical chains): the theoretical freeze/blacklist/mint capability should be classified as "low" concern, NOT "medium" or "info". These powers exist on paper but enforcement against an average DeFi user is extraordinarily rare. Only escalate to "medium" or higher if there is concrete evidence of issuer-side adversarial action against ordinary users (not for theoretical risks, not for sanctioned-address freezes which only affect sanctioned addresses). Do NOT use "info" for token risks -- they are real risk dimensions even if small.

MARKET & FINANCIAL SEVERITY GUIDANCE:
- Token Risks: use "low" for canonical/reputable tokens, "medium" or "high" for unknown or poorly-audited tokens. Never "info".
- Impermanent Loss Exposure: always "info". This is a DeFi fact of life, not an exploit vector.
- MEV Risk: rate based on actual exposure. "low" if minimal, "medium" if meaningful sandwich risk exists.
- Yield Source Sustainability: always "info". Context only.
- Withdrawal / Exit: "low" if no locks. "medium" or "high" if there are queues, delays, or governance-controlled exits.

Rules:
- EVERY numbered checklist item above must appear in vulnerabilityChecks. Do not skip any. If item 19 (Bridge risk) does not apply because there are no bridged assets, still include it as severity "info" with finding "No bridged assets in this position". Minimum 14 checks expected.
- "severity": "critical" / "high" / "medium" / "low" / "info". Use "low" for things that checked out fine (e.g. source verified, no exploits, DAO governance). Use "info" ONLY for the two items marked "always severity info" above (Impermanent Loss and Yield Source).
- "finding" = one short scannable line (under 100 chars). For clean findings, start with the positive result: "Source code verified on Basescan", "No known exploits found", "Uniswap DAO governs via timelock".
- "info" field = 1-2 sentences in plain English. Be concise — under 40 words.
- "learnMoreUrl" = only include for high or critical severity findings. Must be a real, stable URL (Etherscan/Basescan, audit report, Immunefi, rekt.news). Omit entirely for low/info/medium findings to save space.
- "sources" = array of { "title", "url" } objects for any authoritative references you used (protocol docs, audit reports, DeFiLlama, etc). Do not fabricate URLs.`;

  let finalText = "";

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    for (const block of response.content) {
      if (block.type === "text") finalText += block.text;
    }
  } catch (err) {
    console.error("AI research loop error:", err);
    return {
      narrative: `AI research failed: ${err instanceof Error ? err.message : "unknown error"}. The on-chain data above is still accurate.`,
      overallRisk: "medium",
      stackedRisks: [],
      sources: [],
      audits: [],
      exploits: [],
      vulnerabilityChecks: [],
      scenariosThatCanGoWrong: [],
      howToProtectYourself: [],
    };
  }

  // Strip markdown code fences if the AI wrapped the JSON in ```json ... ```
  const stripped = finalText.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
  // Try multiple candidate strings: stripped version, original, and all {...} blobs
  const candidates: string[] = [];
  if (stripped) candidates.push(stripped);
  if (finalText !== stripped) candidates.push(finalText);
  // Also extract any {...} substrings (greedy, last-to-first)
  const blobs = finalText.match(/\{[\s\S]*\}/g) ?? [];
  candidates.push(...[...blobs].reverse());

  console.log(`[ai-parse] finalText length=${finalText.length}, candidates=${candidates.length}`);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.narrative || Array.isArray(parsed.vulnerabilityChecks)) {
        return {
          narrative: parsed.narrative ?? "",
            overallRisk: parsed.overallRisk ?? "medium",
            stackedRisks: Array.isArray(parsed.stackedRisks) ? parsed.stackedRisks : [],
            audits: Array.isArray(parsed.audits) ? parsed.audits : [],
            exploits: Array.isArray(parsed.exploits) ? parsed.exploits : [],
            sources: Array.isArray(parsed.sources)
              ? parsed.sources.map((s: unknown) =>
                  typeof s === "string" ? { title: s, url: s } : s
                )
              : [],
            vulnerabilityChecks: Array.isArray(parsed.vulnerabilityChecks)
              ? parsed.vulnerabilityChecks.map((c: { category?: string; severity?: string; [k: string]: unknown }) => {
                  const rawCategory = typeof c.category === "string" ? c.category : "";
                  const titleLower = (c.title as string ?? "").toLowerCase();
                  let severity = c.severity as string;
                  // Normalize to canonical 4 categories, then apply overrides
                  let finalCategory: YIFFCategory = normalizeCategory(rawCategory);
                  // Withdrawal/exit → Pool Security regardless of what AI said
                  if (titleLower.includes("withdrawal") || titleLower.includes("exit")) {
                    finalCategory = "Pool Security";
                  }
                  if (finalCategory === "Position Economics") {
                    // IL and yield sustainability are DeFi facts, not exploits -- always info
                    const forceInfo = titleLower.includes("impermanent loss") || titleLower.includes("yield source") || titleLower.includes("yield sustain") || titleLower.includes("emission");
                    // Token risks never downgraded to info
                    const forceLow = titleLower.includes("token risk") && severity === "info";
                    if (forceInfo) severity = "info";
                    else if (forceLow) severity = "low";
                  }
                  // Frontend / phishing attacks affect user behaviour, not protocol contracts — cap at medium
                  const isFrontend = titleLower.includes("frontend") || titleLower.includes("phishing");
                  if (isFrontend && (severity === "critical" || severity === "high")) severity = "medium";
                  return { ...c, category: finalCategory, severity };
                })
              : [],
            scenariosThatCanGoWrong: Array.isArray(parsed.scenariosThatCanGoWrong) ? parsed.scenariosThatCanGoWrong : [],
            howToProtectYourself: Array.isArray(parsed.howToProtectYourself) ? parsed.howToProtectYourself : [],
          };
        }
    } catch {
      // try next candidate
    }
  }

  console.log(`[ai-parse] all candidates failed. finalText preview: ${finalText.slice(0, 300)}`);
  return {
    narrative: "AI returned no usable response.",
    overallRisk: "medium",
    stackedRisks: [],
    sources: [],
    vulnerabilityChecks: [],
    scenariosThatCanGoWrong: [],
    howToProtectYourself: [],
    audits: [],
    exploits: [],
  };
}

// ─── Unknown token investigator ──────────────────────────────────────────────

const ERC20_BASIC_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
];

const RISKY_FUNCTIONS = [
  { name: "mint", level: "high" as RiskLevel, detail: "Token has a mint function. supply can be inflated by whoever controls it" },
  { name: "burn", level: "info" as RiskLevel, detail: "Token has a burn function. common, usually low risk" },
  { name: "pause", level: "high" as RiskLevel, detail: "Token can be paused. transfers can be frozen" },
  { name: "blacklist", level: "high" as RiskLevel, detail: "Token has a blacklist. specific addresses can be banned from holding/transferring" },
  { name: "setBlacklist", level: "high" as RiskLevel, detail: "Token has a blacklist setter" },
  { name: "_blacklist", level: "high" as RiskLevel, detail: "Token has a blacklist mechanism" },
  { name: "setFee", level: "medium" as RiskLevel, detail: "Transfer fees can be changed by admin" },
  { name: "setTax", level: "medium" as RiskLevel, detail: "Tax on transfers can be changed by admin" },
  { name: "setMaxTx", level: "medium" as RiskLevel, detail: "Max transaction size can be changed. common in meme tokens" },
  { name: "excludeFromFee", level: "medium" as RiskLevel, detail: "Admin can exclude addresses from fees. favouritism risk" },
];

async function investigateUnknownToken(
  tokenAddr: string,
  chain: Chain,
  provider: ethers.AbstractProvider
): Promise<AssetRisk> {
  const findings: string[] = [];
  let symbol = "?";
  let name = tokenAddr;
  let assetType: AssetType = "standard-erc20";

  // 1. Read basic ERC-20 metadata on-chain
  const contract = new ethers.Contract(tokenAddr, ERC20_BASIC_ABI, provider);
  try {
    const [n, s, d, supply] = await Promise.all([
      ct(contract.name()).catch(() => null),
      ct(contract.symbol()).catch(() => null),
      ct(contract.decimals()).catch(() => null),
      ct(contract.totalSupply()).catch(() => null),
    ]);
    if (n) name = n;
    if (s) symbol = s;
    if (d !== null && supply !== null) {
      const totalHuman = Number(supply) / Math.pow(10, Number(d));
      findings.push(`Total supply: ${totalHuman.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${s ?? ""}`);
    }
  } catch {
    findings.push("Could not read basic ERC-20 metadata. non-standard token");
  }

  // 2. Check if owner is set (centralisation)
  try {
    const owner = await ct(contract.owner());
    if (owner && owner !== ethers.ZeroAddress) {
      const code = await provider.getCode(owner).catch(() => "0x");
      const isEOA = code === "0x";
      if (isEOA) {
        findings.push(`Owner is an EOA (${owner.slice(0, 10)}...). single wallet controls the contract`);
      } else {
        findings.push(`Owner is a contract (${owner.slice(0, 10)}...). could be multisig or another contract`);
      }
    } else {
      findings.push("No owner / ownership renounced. admin functions disabled");
    }
  } catch {
    // No owner(). fine, many tokens don't have one
  }

  // 3. Check for proxy
  const proxyInfo = await detectProxy(tokenAddr, provider);
  if (proxyInfo.isProxy) {
    findings.push(`Upgradeable proxy. implementation can be swapped, changing token behaviour`);
  }

  // 4. Pull ABI and scan for risky functions
  const abi = await getABI(tokenAddr, chain);
  let sourceVerified = false;
  let foundRiskyFunctions = false;
  if (abi && abi !== "Contract source code not verified") {
    sourceVerified = true;
    try {
      const parsed = JSON.parse(abi);
      const fnNames = parsed
        .filter((item: { type: string; name?: string }) => item.type === "function")
        .map((item: { name?: string }) => item.name?.toLowerCase() ?? "");

      for (const risky of RISKY_FUNCTIONS) {
        if (fnNames.some((f: string) => f === risky.name.toLowerCase())) {
          findings.push(risky.detail);
          if (risky.level === "high" || risky.level === "critical") foundRiskyFunctions = true;
        }
      }
    } catch {
      // ABI parse error. skip
    }
  } else {
    findings.push("⚠ Source code is NOT verified on Basescan. extreme caution, you cannot audit this token's logic");
  }

  // Trust level: unknown but verified + no risky fns → caution. Unverified or risky → danger.
  const trustLevel: TrustLevel =
    !sourceVerified || foundRiskyFunctions ? "danger" : "caution";

  return {
    address: tokenAddr,
    symbol: symbol === "?" ? "Unverified" : symbol,
    name,
    assetType,
    trustLevel,
    riskNotes: findings.length > 0 ? findings : ["No risky functions detected from ABI"],
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

// ─── Address-based analysis (pool / gauge address entered directly) ───────────

async function analyzeContractAddress(address: string, chain: Chain, provider: ethers.AbstractProvider, customAbis: Array<{ address: string; abi: string }> = []) {
  const explorerBase = chain === "base" ? "https://basescan.org" : "https://etherscan.io";

  // Reject wallet addresses immediately
  const code = await provider.getCode(address).catch(() => "0x");
  if (code === "0x") {
    return NextResponse.json(
      { error: "That looks like a wallet address. Please paste a pool address, gauge address, or transaction hash instead." },
      { status: 400 }
    );
  }

  const contractRisks: ContractRisk[] = [];
  const sourceSnippets: Record<string, string> = {};
  let detectedPair: { token0Symbol: string; token1Symbol: string } | undefined;
  let detectedFeePercent: number | undefined;
  let detectedProtocol: string | undefined;
  const tokenAddresses = new Set<string>();

  // Round 1: Etherscan pre-fetch
  const [abi, source] = await Promise.all([getABI(address, chain), getContractSource(address, chain)]);
  if (source) sourceSnippets[address] = source;

  // Round 2: RPC analysis
  const proxyInfo = await detectProxy(address, provider);
  const factory = findPoolFactory(address, chain);
  const protocolContract = findProtocolContract(address, chain);
  let poolType: PoolType = factory?.poolType ?? "unknown";
  let autoLabel: string | undefined;
  const findings: Finding[] = [];

  if (protocolContract) {
    for (const note of protocolContract.riskNotes) {
      findings.push({ title: protocolContract.role, detail: note, level: "info" });
    }
    detectedProtocol = protocolContract.protocol;
  }
  if (factory) detectedProtocol = detectedProtocol ?? factory.name.replace(/ \(.+\)$/, "");

  let fullPairInfo: { token0: string; token1: string; token0Symbol: string; token1Symbol: string } | undefined;

  if (!factory && !protocolContract) {
    const auto = await autoDetectPoolType(address, provider, chain);
    findings.push(...auto.findings);
    if (auto.pair) {
      fullPairInfo = auto.pair;
      detectedPair = { token0Symbol: auto.pair.token0Symbol, token1Symbol: auto.pair.token1Symbol };
      tokenAddresses.add(auto.pair.token0.toLowerCase());
      tokenAddresses.add(auto.pair.token1.toLowerCase());
    }
    if (auto.feePercent !== undefined) detectedFeePercent = auto.feePercent;
    if (auto.poolType !== "unknown") {
      poolType = auto.poolType;
      autoLabel = auto.label;
      if (auto.label) detectedProtocol = detectedProtocol ?? auto.label.replace(/ pool$/, "");
    } else if (auto.pair) {
      autoLabel = `Pool (${auto.pair.token0Symbol}/${auto.pair.token1Symbol})`;
      detectedProtocol = detectedProtocol ?? "DEX Pool";
    }
  } else if (factory && poolType !== "unknown") {
    try {
      const pc = new ethers.Contract(address, POOL_AUTODETECT_ABI, provider);
      const [fee, t0, t1] = await Promise.all([
        ct(pc.fee()).catch(() => null),
        ct(pc.token0()).catch(() => null),
        ct(pc.token1()).catch(() => null),
      ]);
      if (t0 && t1) {
        const [s0, s1] = await Promise.all([resolveTokenSymbol(t0, chain, provider), resolveTokenSymbol(t1, chain, provider)]);
        fullPairInfo = { token0: t0, token1: t1, token0Symbol: s0, token1Symbol: s1 };
        detectedPair = { token0Symbol: s0, token1Symbol: s1 };
        tokenAddresses.add(t0.toLowerCase());
        tokenAddresses.add(t1.toLowerCase());
      }
      if (fee !== null) detectedFeePercent = Number(fee) / 10000;
    } catch { /* non-critical */ }
  }

  const adminFindings = await runUniversalAdminChecks(address, provider, chain);
  findings.push(...adminFindings);

  if (proxyInfo.isProxy) {
    findings.push({ title: "Upgradeable proxy", detail: `Implementation: ${proxyInfo.implementation?.slice(0, 10)}...${proxyInfo.admin ? ` Admin: ${proxyInfo.admin.slice(0, 10)}...` : ""}`, level: "high" });
    if (proxyInfo.admin) {
      const adminCode = await provider.getCode(proxyInfo.admin).catch(() => "0x");
      if (adminCode === "0x") {
        findings.push({ title: "Proxy admin is an EOA", detail: `${proxyInfo.admin.slice(0, 10)}.... a single wallet can upgrade this contract instantly.`, level: "critical" });
      } else {
        const adminTimelock = findTimelock(proxyInfo.admin, chain);
        if (adminTimelock) {
          findings.push({ title: `Proxy admin is a timelock (${adminTimelock.protocol})`, detail: `Upgrades must be queued. delay ${adminTimelock.delaySeconds / 3600}h.`, level: "low" });
        } else {
          findings.push({ title: "Proxy admin is a contract", detail: `${proxyInfo.admin.slice(0, 10)}.... could be multisig or another contract.`, level: "medium" });
        }
      }
    }
  }

  if (abi && poolType !== "unknown") {
    const poolFindings = await readContractState(address, abi, provider, poolType);
    findings.push(...poolFindings);
  }

  const label = factory?.name ?? (protocolContract ? `${protocolContract.protocol} ${protocolContract.role}` : undefined) ?? autoLabel ?? `Contract ${address.slice(0, 8)}...`;

  // Round 3: meta + reserves (run in parallel — no artificial delay)
  const [meta, poolReserves, implAbi] = await Promise.all([
    getContractMeta(address, chain),
    fullPairInfo ? getPoolReserves(address, fullPairInfo, chain, provider, detectedProtocol) : Promise.resolve(undefined),
    proxyInfo.isProxy && proxyInfo.implementation && !abi ? getABI(proxyInfo.implementation, chain) : Promise.resolve(null),
  ]);

  const effectiveAbi = abi ?? implAbi;
  contractRisks.push({
    address,
    label,
    poolType: poolType !== "unknown" ? poolType : undefined,
    findings,
    isProxy: proxyInfo.isProxy,
    implementation: proxyInfo.implementation,
    proxyAdmin: proxyInfo.admin,
    functions: effectiveAbi ? categorizeFunctions(effectiveAbi) : undefined,
    deployedAt: meta.deployedAt,
    creatorAddress: meta.creatorAddress,
    // Fix #4 (single-address path): only mark verified via registry hit or confirmed ABI fetch.
    // autoLabel is a context-spill fallback, not evidence of source verification.
    isVerified: !!protocolContract || !!factory || abi !== null,
    poolReserves,
  });

  // Classify token assets from the pair
  const assetRisks: AssetRisk[] = [];
  for (const tokenAddr of tokenAddresses) {
    const known = findKnownAsset(tokenAddr, chain);
    if (known) {
      assetRisks.push({ address: tokenAddr, symbol: known.symbol, name: known.name, assetType: known.assetType, trustLevel: "trusted", riskNotes: known.riskNotes });
    } else {
      assetRisks.push(await investigateUnknownToken(tokenAddr, chain, provider));
    }
  }

  // Enrich asset risks with live prices (best-effort)
  if (assetRisks.length > 0) {
    const tokenPrices = await getTokenPrices(assetRisks.map((a) => a.address), chain);
    for (const asset of assetRisks) {
      const price = tokenPrices[asset.address.toLowerCase()];
      if (price !== undefined) asset.priceUsd = price;
    }
  }

  // AI analysis (same cache logic as tx-based flow)
  const cacheKey = buildCacheKey({ chain, contractAddresses: [address], tokenAddresses: Array.from(tokenAddresses) });
  let ai: Awaited<ReturnType<typeof runAIAnalysis>>;
  const cached = await getCached(cacheKey);
  const [aiResult, activeProposals, llamaExploits] = await Promise.all([
    cached
      ? Promise.resolve(cached.result)
      : runAIAnalysis({ txHash: address, chain, contracts: contractRisks, assets: assetRisks, sourceSnippets, customAbis }),
    getActiveProposals(detectedProtocol),
    getProtocolExploits(detectedProtocol ?? ""),
  ]);
  ai = aiResult;
  if (cached) {
    console.log(`[learned-cache] HIT ${cacheKey}`);
  } else {
    console.log(`[learned-cache] MISS ${cacheKey}. calling AI`);
    if (ai.vulnerabilityChecks && ai.vulnerabilityChecks.length > 0) await putCached(cacheKey, ai);
  }
  if (activeProposals.length > 0) {
    console.log(`[snapshot] ${activeProposals.length} active proposal(s) for ${detectedProtocol}`);
  }
  const exploits = mergeExploits(ai.exploits ?? [], llamaExploits);

  const positionOverview = {
    protocol: detectedProtocol ?? "Unknown protocol",
    pair: detectedPair ? `${detectedPair.token0Symbol} / ${detectedPair.token1Symbol}` : undefined,
    feePercent: detectedFeePercent,
    positionType: poolType !== "unknown" ? "Liquidity Pool" : "Contract",
    chain,
    explorerTxUrl: `${explorerBase}/address/${address}`,
  };

  const flow = findProtocolFlow(detectedProtocol);

  const ON_CHAIN_DEDUCTIONS: Record<RiskLevel, number> = { critical: 20, high: 10, medium: 4, low: 1, info: 0 };
  const AI_DEDUCTIONS_LOCAL: Record<string, Record<RiskLevel, number>> = {
    "Protocol Security":    { critical: 25, high: 12, medium: 5, low: 1, info: 0 }, // 50%
    "Pool Security":        { critical: 10, high: 5,  medium: 2, low: 1, info: 0 }, // 15%
    "Governance & Control": { critical: 15, high: 7,  medium: 3, low: 1, info: 0 }, // 25%
    "Position Economics":   { critical: 5,  high: 2,  medium: 1, low: 0, info: 0 }, // 10%
  };
  let riskScore = 100;
  for (const f of contractRisks.flatMap((c) => c.findings)) riskScore -= ON_CHAIN_DEDUCTIONS[f.level] ?? 0;

  const normalizedChecks = (ai.vulnerabilityChecks ?? []).map((c: { category?: string; severity?: string; title?: string; [k: string]: unknown }) => {
    const titleLower = ((c.title as string) ?? "").toLowerCase();
    let finalCategory = normalizeCategory(typeof c.category === "string" ? c.category : "");
    if (titleLower.includes("withdrawal") || titleLower.includes("exit")) finalCategory = "Pool Security";
    let severity = (c.severity as string) ?? "info";
    if (finalCategory === "Position Economics") {
      if (titleLower.includes("impermanent loss") || titleLower.includes("yield source") || titleLower.includes("yield sustain") || titleLower.includes("emission")) severity = "info";
      else if (titleLower.includes("token risk") && severity === "info") severity = "low";
    }
    if ((titleLower.includes("frontend") || titleLower.includes("phishing")) && (severity === "critical" || severity === "high")) severity = "medium";
    return { ...c, category: finalCategory, severity };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hardcodedChecks: any[] = [];

  // ── Source Verification ─────────────────────────────────────────────────────
  const hasSourceCheck = normalizedChecks.some((c) => typeof c.title === "string" && (c.title.toLowerCase().includes("source") || c.title.toLowerCase().includes("verified") || c.title.toLowerCase().includes("unverified")));
  if (!hasSourceCheck) {
    const unverifiedContracts = contractRisks.filter((c) => c.isVerified === false);
    if (unverifiedContracts.length > 0) {
      hardcodedChecks.push({ category: "Protocol Security", title: "Unverified contract source code", severity: "high", finding: `${unverifiedContracts.length} contract(s) have no verified source code on the block explorer`, info: `Contracts without public source code cannot be independently audited. Anyone depositing cannot verify what the contract actually does. Unverified contracts are a major red flag.`, laymanTerms: "When a smart contract has no public source code, you are trusting the developer completely — you cannot see what the code actually does. This is like sending money to a black box.", learnMoreUrl: `https://${chain === "base" ? "basescan" : "etherscan"}.io` });
    } else if (contractRisks.some((c) => c.isVerified)) {
      hardcodedChecks.push({ category: "Protocol Security", title: `Source code verified on ${chain === "base" ? "Basescan" : "Etherscan"}`, severity: "low", finding: "All contracts touched in this transaction have verified open-source code", info: "Verified source code means anyone can read exactly what the contract does. Security researchers, auditors, and users can all check the code independently.", laymanTerms: "The code running these contracts is fully public — anyone can check it. This is the minimum standard for a trustworthy DeFi product.", learnMoreUrl: `https://${chain === "base" ? "basescan" : "etherscan"}.io` });
    }
  }

  // ── Chain / Network Security ────────────────────────────────────────────────
  const hasChainCheck = normalizedChecks.some((c) => typeof c.title === "string" && (c.title.toLowerCase().includes("sequencer") || c.title.toLowerCase().includes("network") || c.title.toLowerCase().includes("l2") || c.title.toLowerCase().includes("chain")));
  if (!hasChainCheck) {
    if (chain === "base") {
      hardcodedChecks.push({ category: "Governance & Control", title: "Base L2 sequencer dependency", severity: "low", finding: "Base is a Coinbase-operated single-sequencer Optimistic Rollup", info: "Base uses a single sequencer run by Coinbase to order transactions. If the sequencer goes offline, transactions pause but funds are safe — you can always exit via L1. The 7-day fraud proof window means Ethereum is the final security backstop.", laymanTerms: "Base is a faster, cheaper version of Ethereum run by Coinbase. If Coinbase's system goes down, your transactions pause but your money stays safe — you can always move it back to Ethereum directly.", learnMoreUrl: "https://docs.base.org/docs/base-contracts" });
    } else {
      hardcodedChecks.push({ category: "Governance & Control", title: "Ethereum L1 — highest security", severity: "low", finding: "Transaction is on Ethereum mainnet — maximum decentralisation and security", info: "Ethereum is the most battle-tested smart contract platform. No sequencer risk, no bridge risk for native assets.", laymanTerms: "Ethereum is the original blockchain and the most secure. Using it directly means you are not depending on any company to keep things running.", learnMoreUrl: "https://ethereum.org/en/developers/docs/networks/" });
    }
  }

  // ── Token Risks per asset ───────────────────────────────────────────────────
  for (const asset of assetRisks) {
    const symbol = asset.symbol.toLowerCase();
    const aiAlreadyCovered = normalizedChecks.some((c) => {
      const t = (c.title as string ?? "").toLowerCase();
      return (t.includes("token") || t.includes("risk")) && t.includes(symbol);
    });
    if (aiAlreadyCovered) continue;
    const alreadyHardcoded = hardcodedChecks.some((c) => { const t = (c.title as string ?? "").toLowerCase(); return t.includes(symbol); });
    if (alreadyHardcoded) continue;
    const severity = asset.trustLevel === "trusted" ? "low" : asset.trustLevel === "caution" ? "medium" : "high";
    const topNote = asset.riskNotes[0] ?? "No additional risk notes";
    hardcodedChecks.push({ category: "Position Economics", title: `${asset.symbol} — token risk`, severity, finding: severity === "low" ? `${asset.symbol} (${asset.name}) — canonical, well-established token` : `${asset.symbol} (${asset.name}) — ${asset.assetType} with elevated risk`, info: asset.riskNotes.slice(0, 2).join(" "), laymanTerms: severity === "low" ? `${asset.symbol} is a well-known, widely-used token. It carries the standard risks of any digital asset but is not considered high risk on its own.` : `${asset.symbol} carries extra risk: ${topNote}`, learnMoreUrl: `https://${chain === "base" ? "basescan" : "etherscan"}.io/token/${asset.address}` });
  }

  // ── Impermanent Loss — always inject "info" for 2-token LP positions ────────
  const hasILCheck = normalizedChecks.some((c) => typeof c.title === "string" && (c.title.toLowerCase().includes("impermanent") || c.title.toLowerCase().includes("il ")));
  if (!hasILCheck && assetRisks.length >= 2) {
    const symbols = assetRisks.map((a) => a.symbol).join(" / ");
    hardcodedChecks.push({ category: "Position Economics", title: "Impermanent loss exposure", severity: "info", finding: `${symbols} pair — IL risk present on concentrated liquidity position`, info: "Concentrated liquidity positions amplify returns when price is in range but amplify impermanent loss when price moves out of range. If one token moves sharply, you end up holding more of the falling token and less of the rising one.", laymanTerms: `If ${assetRisks[0]?.symbol ?? "token A"} and ${assetRisks[1]?.symbol ?? "token B"} move in opposite directions, the pool rebalances and you end up with less total value than if you had held them separately. This is the main trade-off of being a liquidity provider.`, learnMoreUrl: "https://academy.binance.com/en/articles/impermanent-loss-explained" });
  }

  // ── Withdrawal / Exit ───────────────────────────────────────────────────────
  const hasWithdrawalCheck = normalizedChecks.some((c) => typeof c.title === "string" && (c.title.toLowerCase().includes("withdrawal") || c.title.toLowerCase().includes("exit")));
  const hasKnownPool = contractRisks.some((c) => c.poolType) || !!detectedProtocol;
  if (!hasWithdrawalCheck && hasKnownPool) {
    hardcodedChecks.push({ category: "Pool Security", title: "Withdrawal / Exit", severity: "low", finding: "No locks, queues, or delays on exiting the position", info: "Standard AMM pools let you remove liquidity at any time with no waiting period or exit penalty. Your funds are not locked.", laymanTerms: "You can take your money out whenever you want. There is no waiting period, no queue, and no fee to exit beyond normal network gas costs.", learnMoreUrl: undefined });
  }

  // ── Uniswap V4 structural risks ─────────────────────────────────────────────
  const isV4Local = contractRisks.some((c) => c.poolType === "uniswap-v4") ||
    (detectedProtocol?.toLowerCase().includes("uniswap v4") ?? false);
  if (isV4Local) {
    if (!normalizedChecks.some((c) => typeof c.title === "string" && c.title.toLowerCase().includes("hook"))) {
      hardcodedChecks.push({ category: "Pool Security", title: "V4 Hook risk", severity: "medium", finding: "Uniswap V4 pools can attach custom hook contracts that execute on every swap and liquidity change", info: "Hooks are arbitrary smart contracts that run before and after every pool action. A malicious or buggy hook could drain funds, block withdrawals, or manipulate prices.", laymanTerms: "Think of hooks like a plugin that runs automatically every time anyone touches the pool. If the plugin is broken or malicious, it can affect your money.", learnMoreUrl: "https://docs.uniswap.org/contracts/v4/concepts/hooks" });
    }
    if (!normalizedChecks.some((c) => typeof c.title === "string" && c.title.toLowerCase().includes("singleton"))) {
      hardcodedChecks.push({ category: "Protocol Security", title: "Singleton PoolManager", severity: "medium", finding: "All V4 liquidity lives in one contract — a bug or exploit affects every pool simultaneously", info: "Unlike V3 where each pool is a separate contract, V4 stores all liquidity in a single PoolManager. A vulnerability could expose every V4 pool at once.", laymanTerms: "In V3, every pool had its own vault. In V4, all pools share one giant vault. If someone finds a way to break into it, all pools are at risk at once.", learnMoreUrl: "https://docs.uniswap.org/contracts/v4/concepts/poolmanager" });
    }
    if (!normalizedChecks.some((c) => typeof c.title === "string" && c.title.toLowerCase().includes("governance"))) {
      hardcodedChecks.push({ category: "Governance & Control", title: "Uniswap DAO governance", severity: "low", finding: "Protocol parameters controlled by Uniswap DAO via timelock — no single wallet admin", info: "Uniswap V4 is governed by UNI token holders through on-chain governance with a timelock delay.", laymanTerms: "No single person or company controls Uniswap. Changes require a public vote and a waiting period.", learnMoreUrl: "https://gov.uniswap.org" });
    }
  }

  const allChecks = [...hardcodedChecks, ...normalizedChecks];
  for (const check of allChecks) {
    const table = AI_DEDUCTIONS_LOCAL[check.category as string] ?? AI_DEDUCTIONS_LOCAL["Protocol Security"];
    riskScore -= table[check.severity as RiskLevel] ?? 0;
  }
  // Penalty for thin analysis — if the AI produced fewer than 3 checks, we don't
  // have enough signal to justify a high score. Cap at 75 in that case.
  if (normalizedChecks.length < 3) riskScore = Math.min(riskScore, 75);
  // Penalty for unknown pool — we couldn't identify the pool type so analysis is incomplete.
  if (!contractRisks.some((c) => c.poolType)) riskScore = Math.min(riskScore, 80);

  riskScore = Math.max(0, Math.min(100, riskScore));

  // Fix #6 (address path): same as tx path — derive label from live score to stay consistent on cache hits.
  const derivedOverallRiskAddr: RiskLevel =
    riskScore >= 80 ? "low" :
    riskScore >= 60 ? "medium" :
    riskScore >= 40 ? "high" : "critical";

  return NextResponse.json({
    txHash: address,
    chain,
    summary: `Analysis of ${label} on ${chain.charAt(0).toUpperCase() + chain.slice(1)}.`,
    overallRisk: derivedOverallRiskAddr,
    riskScore,
    positionOverview,
    contracts: contractRisks,
    assets: assetRisks,
    stackedRisks: ai.stackedRisks,
    aiNarrative: ai.narrative,
    sources: ai.sources,
    audits: ai.audits,
    exploits,
    activeProposals,
    vulnerabilityChecks: allChecks,
    scenariosThatCanGoWrong: ai.scenariosThatCanGoWrong,
    howToProtectYourself: ai.howToProtectYourself,
    protocolFlow: flow ? { name: flow.flowName, steps: flow.steps, callout: flow.callout } : null,
    protocolDocs: flow ? flow.docs : null,
  });
}

// ─── Simple in-process rate limiter (AI call cap per IP per day) ─────────────
// Resets on server restart / cold start. Stops abuse on shared deployments.
// On Vercel, each serverless function instance tracks its own counts — this is
// intentionally lightweight. Swap for Redis / Upstash if you need cross-instance limits.

type RateBucket = { count: number; dayKey: string };
const ipRateMap = new Map<string, RateBucket>();
const AI_CALLS_PER_IP_PER_DAY = 20;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const day = todayKey();
  const bucket = ipRateMap.get(ip);
  if (!bucket || bucket.dayKey !== day) {
    ipRateMap.set(ip, { count: 1, dayKey: day });
    return { allowed: true, remaining: AI_CALLS_PER_IP_PER_DAY - 1 };
  }
  if (bucket.count >= AI_CALLS_PER_IP_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }
  bucket.count++;
  return { allowed: true, remaining: AI_CALLS_PER_IP_PER_DAY - bucket.count };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { txHash?: string; input?: string; chain: Chain; customAbis?: Array<{ address: string; abi: string }> };
    const rawInput = (body.txHash ?? body.input ?? "").trim();
    const chain = body.chain;
    const customAbis: Array<{ address: string; abi: string }> = (body.customAbis ?? [])
      .filter(ca => ca.address?.startsWith("0x") && ca.abi?.trim().length > 0)
      .slice(0, 5); // cap at 5 to limit prompt size

    const isAddress = /^0x[0-9a-fA-F]{40}$/.test(rawInput);
    const isTxHash  = /^0x[0-9a-fA-F]{64}$/.test(rawInput);

    if (!rawInput || !chain) {
      return NextResponse.json({ error: "Input and chain are required." }, { status: 400 });
    }
    // Fix #3: validate chain against known values before any further processing
    const VALID_CHAINS: Chain[] = ["ethereum", "base"];
    if (!VALID_CHAINS.includes(chain as Chain)) {
      return NextResponse.json({ error: "Invalid chain. Supported chains: ethereum, base." }, { status: 400 });
    }
    if (!isAddress && !isTxHash) {
      return NextResponse.json({ error: "Invalid input. Paste a transaction hash (0x... 66 chars) or a pool/gauge address (0x... 42 chars)." }, { status: 400 });
    }

    // Rate-limit AI calls per IP (cache hits bypass this; only fresh AI calls count).
    // We check here so the limit only fires when we're about to call Anthropic.
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Daily analysis limit reached (${AI_CALLS_PER_IP_PER_DAY} per day). Try again tomorrow, or use a previously analysed transaction.` },
        { status: 429 }
      );
    }

    const provider = getProvider(chain);

    // Address mode: analyse the contract directly (pool, gauge, etc.)
    if (isAddress) return await analyzeContractAddress(rawInput, chain, provider, customAbis);

    // Transaction hash mode: existing flow
    const txHash = rawInput;

    // 1. Fetch the transaction + receipt — use sequential RPC fallback so a
    //    fast-but-stale node returning null doesn't kill the request.
    const { tx, receipt } = await getTransactionWithFallback(txHash, chain);

    if (!tx || !receipt) {
      return NextResponse.json({ error: "Transaction not found. Check the hash and chain." }, { status: 404 });
    }

    // Detect plain wallet-to-wallet ETH transfers (no calldata, no logs, recipient is an EOA)
    const isPlainTransfer =
      receipt.logs.length === 0 &&
      (tx.data === "0x" || tx.data === "" || tx.data == null);
    if (isPlainTransfer) {
      // Confirm the recipient is not a contract (code === "0x" means EOA)
      const toCode = tx.to ? await provider.getCode(tx.to).catch(() => "0x") : "0x";
      if (toCode === "0x") {
        return NextResponse.json(
          {
            error:
              "This looks like a plain ETH transfer between wallets — there is no DeFi protocol to analyse. " +
              "Try pasting a transaction where you deposited into a liquidity pool, gauge, or yield vault.",
          },
          { status: 400 }
        );
      }
    }

    // 2. Collect all unique contract addresses touched
    const touchedAddresses = new Set<string>();
    if (tx.to) touchedAddresses.add(tx.to.toLowerCase());
    for (const log of receipt.logs) {
      touchedAddresses.add(log.address.toLowerCase());
    }

    // 3. Identify ERC-20 tokens from Transfer events
    // ERC-20 Transfer: 3 topics (event sig + from + to), value in data
    // ERC-721 Transfer: 4 topics (event sig + from + to + tokenId)
    // We only want ERC-20 fungible tokens here; NFTs are tracked separately.
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const tokenAddresses = new Set<string>();
    const nftAddresses = new Set<string>();
    for (const log of receipt.logs) {
      if (log.topics[0] === TRANSFER_TOPIC) {
        if (log.topics.length === 3) {
          tokenAddresses.add(log.address.toLowerCase());
        } else if (log.topics.length === 4) {
          nftAddresses.add(log.address.toLowerCase());
        }
      }
    }

    // 3a. Uniswap V4 special handling:
    //   - Decode fee + currencies from PositionManager calldata (no per-pool contract to call)
    //   - Detect native ETH (currency0 = address(0)) and add WETH as a token so the pair
    //     shows "WETH / TOKEN" and the ETH asset price is resolved
    const V4_POOL_MANAGER_ADDRESSES: Record<Chain, string> = {
      base: "0x498581ff718922c3f8e6a244956af099b2652b2b",
      ethereum: "0x000000000004444c5dc75cb358380d2e3de08a90",
    };
    const V4_POSITION_MANAGER_ADDRESSES: Record<Chain, string> = {
      base: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
      ethereum: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
    };
    const WETH_ADDRESSES: Record<Chain, string> = {
      base: "0x4200000000000000000000000000000000000006",
      ethereum: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    };
    const v4PoolManager = V4_POOL_MANAGER_ADDRESSES[chain];
    const isV4Tx = touchedAddresses.has(v4PoolManager);
    let v4Fee: number | undefined;

    if (isV4Tx) {
      // Primary: decode fee from PositionManager calldata (works for LP minting)
      const poolKey = tryDecodeV4PoolKey(tx.data ?? "");
      if (poolKey) {
        v4Fee = poolKey.feePercent;
        // currency0 = address(0) means native ETH — add WETH as its ERC20 proxy for
        // price resolution and pair display
        const ETH_ZERO = "0x0000000000000000000000000000000000000000";
        if (poolKey.currency0 === ETH_ZERO) {
          tokenAddresses.add(WETH_ADDRESSES[chain].toLowerCase());
        } else if (poolKey.currency1 === ETH_ZERO) {
          tokenAddresses.add(WETH_ADDRESSES[chain].toLowerCase());
        }
        // Ensure both explicit currencies are in the token set if they're ERC20
        if (poolKey.currency0 !== ETH_ZERO) tokenAddresses.add(poolKey.currency0);
        if (poolKey.currency1 !== ETH_ZERO) tokenAddresses.add(poolKey.currency1);
      } else {
        // Fallback: if native ETH is an input (tx.value > 0), add WETH to tokenAddresses
        const rawValue = (tx as unknown as { value?: string }).value;
        const txValueWei = rawValue ? BigInt(rawValue) : BigInt(0);
        if (txValueWei > BigInt(0)) {
          tokenAddresses.add(WETH_ADDRESSES[chain].toLowerCase());
        }
      }
    }

    // Also register the V4 PositionManager as a known address if present
    const v4PM = V4_POSITION_MANAGER_ADDRESSES[chain];
    if (touchedAddresses.has(v4PM)) {
      // Already handled via registry — just ensure it's in contractAddresses
    }

    // 3b. Read NFT position data (tickLower/tickUpper) for concentrated liquidity positions.
    // Find the minted tokenId from the ERC-721 Transfer-from-zero log, then call positions() on
    // the position manager to get the actual price range. This prevents AI from hallucinating it.
    let nftPriceRange: { lower: number; upper: number; token0Symbol?: string; token1Symbol?: string } | undefined;
    let nftFeePercent: number | undefined; // fee read alongside NFT position, used to seed detectedFeePercent
    const POSITION_MANAGER_ABI = [
      "function positions(uint256 tokenId) view returns (uint96, address, address token0, address token1, int24, int24 tickLower, int24 tickUpper, uint128, uint256, uint256, uint128, uint128)",
    ];
    for (const log of receipt.logs) {
      if (
        log.topics[0] === TRANSFER_TOPIC &&
        log.topics.length === 4 &&
        log.topics[1] === "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        // ERC-721 mint: topics[3] is the tokenId
        const tokenId = BigInt(log.topics[3]);
        const pmAddress = log.address.toLowerCase();
        const pm = findProtocolContract(pmAddress, chain);
        if (pm?.role === "position-manager") {
          try {
            const pmContract = new ethers.Contract(pmAddress, POSITION_MANAGER_ABI, provider);
            const pos = await pmContract.positions(tokenId);
            const tickLower: number = Number(pos[5]);
            const tickUpper: number = Number(pos[6]);
            const token0Addr: string = pos[2];
            const token1Addr: string = pos[3];
            const feeOrTickSpacing: number = Number(pos[4]);

            // Derive fee from position data.
            // For Uniswap v3-style PMs: pos[4] = fee in ppm (e.g. 3000 → 0.3%)
            // For Aerodrome SlipStream PM: pos[4] = tickSpacing (not fee) — must call pool.fee() via factory.
            const isSlipStream = pm.protocol?.toLowerCase().includes("slipstream");
            if (isSlipStream) {
              try {
                const slipFactory = findPoolFactoryByType("aerodrome-slipstream", chain);
                if (slipFactory) {
                  const factoryContract = new ethers.Contract(
                    slipFactory.factoryAddress,
                    ["function getPool(address,address,int24) view returns (address)"],
                    provider
                  );
                  const poolAddr: string = await factoryContract.getPool(token0Addr, token1Addr, feeOrTickSpacing);
                  if (poolAddr && poolAddr !== ethers.ZeroAddress) {
                    const poolFee = await new ethers.Contract(
                      poolAddr,
                      ["function fee() view returns (uint24)"],
                      provider
                    ).fee().catch(() => null);
                    if (poolFee !== null) nftFeePercent = Number(poolFee) / 10000;
                  }
                }
              } catch { /* non-critical — fee will be read from pool in contract analysis loop */ }
            } else {
              // Standard Uniswap v3 PM: pos[4] is the fee tier in ppm
              if (feeOrTickSpacing > 0) nftFeePercent = feeOrTickSpacing / 10000;
            }

            const t0Asset = findKnownAsset(token0Addr, chain);
            const t1Asset = findKnownAsset(token1Addr, chain);
            const dec0 = t0Asset?.decimals ?? 18;
            // Fix #5: default to 18 (standard ERC-20), not 6 — using 6 produces 10^12× wrong price for 18-decimal tokens
            const dec1 = t1Asset?.decimals ?? 18;
            // price = 1.0001^tick * 10^(dec0-dec1) gives token1 per token0 in human units
            const tickToPrice = (tick: number) => Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
            nftPriceRange = {
              lower: Math.round(tickToPrice(tickLower) * 100) / 100,
              upper: Math.round(tickToPrice(tickUpper) * 100) / 100,
              token0Symbol: t0Asset?.symbol,
              token1Symbol: t1Asset?.symbol,
            };
            console.log(`[nft-position] tokenId=${tokenId} tickLower=${tickLower} tickUpper=${tickUpper} priceRange=${nftPriceRange.lower}-${nftPriceRange.upper}`);
          } catch (e) {
            console.warn(`[nft-position] failed to read positions(${tokenId}):`, e);
          }
        }
        break; // only need the first mint
      }
    }

    // 4. Analyze contracts (skip token addresses. those go in Asset Risks)
    const contractRisks: ContractRisk[] = [];
    const sourceSnippets: Record<string, string> = {};
    let detectedPair: { token0Symbol: string; token1Symbol: string } | undefined;
    // Seed fee from NFT position data if we already read it — more reliable than
    // waiting for autoDetectPoolType to read fee() from the pool (which can fail on
    // rate-limited public RPCs). Defined below after nftFeePercent is resolved.
    let detectedFeePercent: number | undefined = nftFeePercent ?? v4Fee;
    let detectedProtocol: string | undefined;

    // Determine which addresses belong in contract analysis.
    // Exclude plain ERC-20 tokens and NFT LP tokens — UNLESS the address is a
    // registered protocol contract (e.g. the NFT Position Manager emits ERC-721
    // transfers but IS a contract we care about analyzing).
    const contractAddresses = Array.from(touchedAddresses).filter((addr) => {
      const isKnownProtocol = !!findProtocolContract(addr, chain);
      return isKnownProtocol || (!tokenAddresses.has(addr) && !nftAddresses.has(addr));
    });

    // ── Round 1: parallel Etherscan pre-fetch (ABI + source) for all contracts ──
    // Running these in parallel avoids sequential rate-limit hits that silently
    // return null for every call after the first when no API key is set.
    const [abiResults, sourceResults] = await Promise.all([
      Promise.all(contractAddresses.map((addr) => getABI(addr, chain))),
      Promise.all(contractAddresses.map((addr) => getContractSource(addr, chain))),
    ]);
    const abiMap = new Map(contractAddresses.map((addr, i) => [addr, abiResults[i]]));
    const sourceMap = new Map(contractAddresses.map((addr, i) => [addr, sourceResults[i]]));
    for (const [addr, src] of sourceMap) {
      if (src) sourceSnippets[addr] = src;
    }

    // ── Round 2: RPC-only analysis loop (no Etherscan calls here) ────────────
    // Collect intermediate work items so we can batch the remaining Etherscan
    // calls (meta + reserves + impl ABIs) in a single parallel round after the loop.
    type WorkItem = {
      address: string;
      label: string;
      poolType: PoolType;
      findings: Finding[];
      isProxy: boolean;
      implementation?: string;
      proxyAdmin?: string;
      directAbi: string | null;
      implAddrForAbi?: string; // fetch implementation ABI in round 3
      fullPairInfo?: { token0: string; token1: string; token0Symbol: string; token1Symbol: string };
      isVerified: boolean;
    };
    // Run per-contract analysis in parallel — each contract is independent.
    // Each item also returns any shared-state values it detected so we can merge below.
    type WorkResult = WorkItem & {
      _detectedProtocol?: string;
      _detectedPair?: { token0Symbol: string; token1Symbol: string };
      _detectedFeePercent?: number;
    };

    const workResults: WorkResult[] = await Promise.all(contractAddresses.map(async (address): Promise<WorkResult> => {
      const abi = abiMap.get(address) ?? null;

      const proxyInfo = await detectProxy(address, provider);
      const factory = findPoolFactory(address, chain);
      const protocolContract = findProtocolContract(address, chain);
      let poolType: PoolType = factory?.poolType ?? "unknown";
      let autoLabel: string | undefined;

      const findings: Finding[] = [];

      // Add findings from known protocol contracts (routers, position managers, voters)
      if (protocolContract) {
        for (const note of protocolContract.riskNotes) {
          findings.push({ title: protocolContract.role, detail: note, level: "info" });
        }
        detectedProtocol = detectedProtocol ?? protocolContract.protocol;
      }
      if (factory) {
        detectedProtocol = detectedProtocol ?? factory.name.replace(/ \(.+\)$/, "");
      }

      // For unknown contracts: run full auto-detection to identify pool type, pair, and fee.
      // For known factory pools: do a lightweight token0/token1/fee read only (readContractState handles findings).
      let fullPairInfo: WorkItem["fullPairInfo"];
      if (!factory && !protocolContract) {
        const auto = await autoDetectPoolType(address, provider, chain);
        // Always capture pair/fee regardless of whether factory was recognized
        findings.push(...auto.findings);
        if (auto.pair) {
          fullPairInfo = auto.pair;
          detectedPair = detectedPair ?? {
            token0Symbol: auto.pair.token0Symbol,
            token1Symbol: auto.pair.token1Symbol,
          };
        }
        // Capture fee regardless of whether factory was recognized
        if (auto.feePercent !== undefined) detectedFeePercent = detectedFeePercent ?? auto.feePercent;
        if (auto.poolType !== "unknown") {
          poolType = auto.poolType;
          autoLabel = auto.label;
          if (auto.label) detectedProtocol = detectedProtocol ?? auto.label.replace(/ pool$/, "");
        } else if (auto.pair) {
          // Unknown factory but we resolved token pair — use a descriptive label
          autoLabel = `Pool (${auto.pair.token0Symbol}/${auto.pair.token1Symbol})`;
          detectedProtocol = detectedProtocol ?? "DEX Pool";
        } else {
          // RPC completely failed — fall back to protocol context if already detected
          if (detectedProtocol) autoLabel = `${detectedProtocol} pool`;
        }
      } else if (factory && poolType !== "unknown") {
        // Known factory pool: read pair tokens and fee directly without re-running full auto-detect.
        // Always populate fullPairInfo (not gated on detectedPair) so each pool gets its own reserves.
        try {
          const pc = new ethers.Contract(address, POOL_AUTODETECT_ABI, provider);
          const [fee, t0, t1] = await Promise.all([
            ct(pc.fee()).catch(() => null),
            ct(pc.token0()).catch(() => null),
            ct(pc.token1()).catch(() => null),
          ]);
          if (t0 && t1) {
            const [s0, s1] = await Promise.all([
              resolveTokenSymbol(t0, chain, provider),
              resolveTokenSymbol(t1, chain, provider),
            ]);
            fullPairInfo = { token0: t0, token1: t1, token0Symbol: s0, token1Symbol: s1 };
            detectedPair = detectedPair ?? { token0Symbol: s0, token1Symbol: s1 };
          }
          if (fee !== null) detectedFeePercent = detectedFeePercent ?? Number(fee) / 10000;
        } catch {
          // non-critical: position overview will show without pair/fee
        }
      }

      // Universal admin checks: owner / getOwner / admin / pendingOwner / paused (all RPC)
      const adminFindings = await runUniversalAdminChecks(address, provider, chain);
      findings.push(...adminFindings);

      // Proxy / upgradeability check
      if (proxyInfo.isProxy) {
        findings.push({
          title: "Upgradeable proxy",
          detail: `Implementation: ${proxyInfo.implementation?.slice(0, 10)}...${proxyInfo.admin ? ` Admin: ${proxyInfo.admin.slice(0, 10)}...` : ""}`,
          level: "high",
        });

        if (proxyInfo.admin) {
          const code = await provider.getCode(proxyInfo.admin).catch(() => "0x");
          if (code === "0x") {
            findings.push({
              title: "Proxy admin is an EOA",
              detail: `${proxyInfo.admin.slice(0, 10)}.... a single wallet can upgrade this contract instantly.`,
              level: "critical",
            });
          } else {
            const adminTimelock = findTimelock(proxyInfo.admin, chain);
            if (adminTimelock) {
              findings.push({
                title: `Proxy admin is a timelock (${adminTimelock.protocol})`,
                detail: `Upgrades must be queued. delay ${adminTimelock.delaySeconds / 3600}h.`,
                level: "low",
              });
            } else {
              findings.push({
                title: "Proxy admin is a contract",
                detail: `${proxyInfo.admin.slice(0, 10)}.... could be multisig or another contract. Verify before relying on this.`,
                level: "medium",
              });
            }
          }
        }
      }

      // Pool-specific checks (slot0, fee, isAlive, is_killed, A-ramp, etc.)
      if (abi && poolType !== "unknown") {
        const poolFindings = await readContractState(address, abi, provider, poolType);
        findings.push(...poolFindings);
      }

      // Resolve which address to fetch the implementation ABI from (round 3).
      // Priority 1: EIP-1967 proxy slot already resolved by detectProxy.
      // Priority 2: explicit implementation() view function (covers non-EIP-1967 proxies and clones).
      let implAddrForAbi: string | undefined;
      if (!abi) {
        if (proxyInfo.isProxy && proxyInfo.implementation) {
          implAddrForAbi = proxyInfo.implementation;
        } else {
          try {
            const implContract = new ethers.Contract(
              address,
              ["function implementation() view returns (address)"],
              provider
            );
            const impl: string = await implContract.implementation();
            if (impl && impl !== ethers.ZeroAddress) implAddrForAbi = impl;
          } catch {
            // Contract doesn't expose implementation(). skip.
          }
        }
      }

      const label =
        factory?.name
        ?? (protocolContract ? `${protocolContract.protocol} ${protocolContract.role}` : undefined)
        ?? autoLabel
        ?? `Unknown contract ${address.slice(0, 8)}...`;

      return {
        address,
        label,
        poolType,
        findings,
        isProxy: proxyInfo.isProxy,
        implementation: proxyInfo.implementation,
        proxyAdmin: proxyInfo.admin,
        directAbi: abi,
        implAddrForAbi,
        fullPairInfo,
        // Fix #4: autoLabel is a fallback string derived from context spill, not evidence of verification.
        // Only treat a contract as verified if we positively identified it via registry OR fetched its ABI.
        isVerified: !!protocolContract || !!factory || abi !== null,
        _detectedProtocol: protocolContract?.protocol ?? factory?.name?.replace(/ \(.+\)$/, "") ?? autoLabel?.replace(/ pool$/, "") ?? undefined,
        _detectedPair: fullPairInfo ? { token0Symbol: fullPairInfo.token0Symbol, token1Symbol: fullPairInfo.token1Symbol } : undefined,
        _detectedFeePercent: detectedFeePercent,
      };
    }));

    // Merge shared state from parallel results
    const workItems: WorkItem[] = workResults.map((r) => {
      const { _detectedProtocol, _detectedPair, _detectedFeePercent, ...item } = r;
      if (_detectedProtocol) detectedProtocol = detectedProtocol ?? _detectedProtocol;
      if (_detectedPair) detectedPair = detectedPair ?? _detectedPair;
      if (_detectedFeePercent !== undefined) detectedFeePercent = detectedFeePercent ?? _detectedFeePercent;
      return item;
    });

    // ── Round 3: parallel Etherscan post-fetch (meta + reserves + impl ABIs) ──
    const uniqueImplAddrs = [...new Set(workItems.map((w) => w.implAddrForAbi).filter(Boolean) as string[])];
    const [metaResults, reserveResults, implAbiResults] = await Promise.all([
      Promise.all(workItems.map((w) => getContractMeta(w.address, chain))),
      Promise.all(workItems.map((w) =>
        w.fullPairInfo ? getPoolReserves(w.address, w.fullPairInfo, chain, provider, detectedProtocol) : Promise.resolve(undefined)
      )),
      Promise.all(uniqueImplAddrs.map((addr) => getABI(addr, chain))),
    ]);
    const implAbiMap = new Map(uniqueImplAddrs.map((addr, i) => [addr, implAbiResults[i]]));

    // ── Build contractRisks from work items + round-3 results ─────────────────
    for (let i = 0; i < workItems.length; i++) {
      const w = workItems[i];
      const meta = metaResults[i];
      const poolReserves = reserveResults[i];
      const effectiveAbi = w.directAbi ?? (w.implAddrForAbi ? implAbiMap.get(w.implAddrForAbi) ?? null : null);

      console.log(`[contract-meta] ${w.address.slice(0, 8)} deployedAt=${meta.deployedAt} creator=${meta.creatorAddress?.slice(0, 8)} reserves=${poolReserves ? "ok" : "none"} abi=${effectiveAbi ? "ok" : "none"}`);

      contractRisks.push({
        address: w.address,
        label: w.label,
        poolType: w.poolType !== "unknown" ? w.poolType : undefined,
        findings: w.findings,
        isProxy: w.isProxy,
        implementation: w.implementation,
        proxyAdmin: w.proxyAdmin,
        functions: effectiveAbi ? categorizeFunctions(effectiveAbi) : undefined,
        deployedAt: meta.deployedAt,
        creatorAddress: meta.creatorAddress,
        isVerified: w.isVerified,
        poolReserves,
      });
    }

    // Fallback: if pair wasn't resolved from RPC token0/token1, derive it from the
    // ERC-20 Transfer events in the tx (tokenAddresses is always populated from logs)
    if (!detectedPair && tokenAddresses.size >= 2) {
      const addrs = Array.from(tokenAddresses).slice(0, 2);
      const [s0, s1] = await Promise.all(
        addrs.map((a) => resolveTokenSymbol(a, chain, provider))
      );
      detectedPair = { token0Symbol: s0, token1Symbol: s1 };
      // Also populate fullPairInfo on the pool contract so reserves get fetched
      const poolWork = workItems.find((w) => w.poolType !== "unknown");
      if (poolWork && !poolWork.fullPairInfo) {
        poolWork.fullPairInfo = { token0: addrs[0], token1: addrs[1], token0Symbol: s0, token1Symbol: s1 };
      }
    }

    // Position type heuristic
    const positionType = nftAddresses.size > 0
      ? "Concentrated Liquidity NFT (active management)"
      : tokenAddresses.size >= 2
        ? "LP token position"
        : "Single-asset position";

    // riskScore computed after AI analysis so we can include AI checks (see below)

    const explorerBase = chain === "base" ? "https://basescan.org" : "https://etherscan.io";

    const positionOverview = {
      protocol: detectedProtocol ?? "Unknown protocol",
      pair: detectedPair ? `${detectedPair.token0Symbol} / ${detectedPair.token1Symbol}` : undefined,
      feePercent: detectedFeePercent,
      positionType,
      chain,
      explorerTxUrl: `${explorerBase}/tx/${txHash}`,
      nftPriceRange,
    };

    // 5. Classify assets
    const assetRisks: AssetRisk[] = [];
    for (const tokenAddr of tokenAddresses) {
      const known = findKnownAsset(tokenAddr, chain);
      if (known) {
        // Anything in our static registry is a known/vetted asset. trustLevel "trusted".
        // Individual riskNotes are caveats to be aware of, not red flags on the token itself.
        assetRisks.push({
          address: tokenAddr,
          symbol: known.symbol,
          name: known.name,
          assetType: known.assetType,
          trustLevel: "trusted",
          riskNotes: known.riskNotes,
        });
      } else {
        // Unknown token. investigate it on-chain
        const investigated = await investigateUnknownToken(tokenAddr, chain, provider);
        assetRisks.push(investigated);
      }
    }

    // Enrich asset risks with live prices from DeFiLlama (best-effort, non-blocking)
    if (assetRisks.length > 0) {
      const tokenPrices = await getTokenPrices(assetRisks.map((a) => a.address), chain);
      for (const asset of assetRisks) {
        const price = tokenPrices[asset.address.toLowerCase()];
        if (price !== undefined) asset.priceUsd = price;
      }
    }

    // 6. AI analysis (with persistent learned-cache)
    // Fingerprint by chain + contract addresses + token addresses so two
    // different transactions touching the same pool/tokens both hit the cache.
    // 30-day TTL is set in app/lib/learned-cache.ts.
    const cacheKey = buildCacheKey({
      chain,
      contractAddresses: contractRisks.map((c) => c.address),
      tokenAddresses: Array.from(tokenAddresses),
    });
    let ai: Awaited<ReturnType<typeof runAIAnalysis>>;
    const cached = await getCached(cacheKey);
    // Fire governance proposals + exploit lookup in parallel — fast API calls, independent of AI
    const [aiResult, activeProposals, llamaExploits] = await Promise.all([
      cached
        ? Promise.resolve(cached.result)
        : runAIAnalysis({ txHash, chain, contracts: contractRisks, assets: assetRisks, sourceSnippets, nftPriceRange, customAbis }),
      getActiveProposals(detectedProtocol),
      getProtocolExploits(detectedProtocol ?? ""),
    ]);
    ai = aiResult;
    if (cached) {
      console.log(`[learned-cache] HIT ${cacheKey} (saved ~$0.20 in AI cost)`);
    } else {
      console.log(`[learned-cache] MISS ${cacheKey}. calling AI`);
      if (ai.vulnerabilityChecks && ai.vulnerabilityChecks.length > 0) {
        await putCached(cacheKey, ai);
      }
    }
    if (activeProposals.length > 0) {
      console.log(`[snapshot] ${activeProposals.length} active proposal(s) for ${detectedProtocol}`);
    }
    const exploits = mergeExploits(ai.exploits ?? [], llamaExploits);

    // 7. Simple summary line
    const knownAssetSymbols = assetRisks.filter((a) => a.symbol !== "Unknown").map((a) => a.symbol);
    const poolName = contractRisks.find((c) => c.poolType)?.label ?? "unknown protocol";
    const summary = `Deposit into ${poolName} on ${chain.charAt(0).toUpperCase() + chain.slice(1)} involving ${knownAssetSymbols.join(", ") || "unknown assets"}.`;

    // Position flow + docs (protocol-specific). Undefined for unknown protocols.
    const flow = findProtocolFlow(detectedProtocol);

    // ── Risk Score ──────────────────────────────────────────────────────────────
    // Starts at 100. On-chain findings (direct, high-confidence) deduct the most.
    // AI vulnerability checks deduct by category: protocol/pool checks matter most,
    // governance (admin access) somewhat less, position economics (IL, yield) least.
    // YIFF-aligned weights: Counterparty (Governance) 50%, Platform (Protocol) 30%,
    // Pool 10%, Market & Financial (Economics) 10%.
    // On-chain findings are high-confidence direct security signals — deduct the most.
    const ON_CHAIN_DEDUCTIONS: Record<RiskLevel, number> = { critical: 20, high: 10, medium: 4, low: 1, info: 0 };
    // AI checks deduct by category weight. Governance & Control carries the most weight
    // (admin access, oracle, team) per YIFF methodology.
    const AI_DEDUCTIONS: Record<string, Record<RiskLevel, number>> = {
      "Protocol Security":    { critical: 25, high: 12, medium: 5, low: 1, info: 0 }, // 50%
      "Pool Security":        { critical: 10, high: 5,  medium: 2, low: 1, info: 0 }, // 15%
      "Governance & Control": { critical: 15, high: 7,  medium: 3, low: 1, info: 0 }, // 25%
      "Position Economics":   { critical: 5,  high: 2,  medium: 1, low: 0, info: 0 }, // 10%
    };
    let riskScore = 100;
    for (const f of contractRisks.flatMap((c) => c.findings)) {
      riskScore -= ON_CHAIN_DEDUCTIONS[f.level] ?? 0;
    }
    // AI checks deducted after normalization (applied below after normalizedChecks)
    // We'll patch riskScore again right after normalizedChecks is built.

    // Always normalize vulnerability check categories before sending — covers both
    // fresh AI responses and cached results that may have used old category names.
    const normalizedChecks = (ai.vulnerabilityChecks ?? []).map((c: { category?: string; severity?: string; title?: string; [k: string]: unknown }) => {
      const titleLower = ((c.title as string) ?? "").toLowerCase();
      let finalCategory = normalizeCategory(typeof c.category === "string" ? c.category : "");
      if (titleLower.includes("withdrawal") || titleLower.includes("exit")) finalCategory = "Pool Security";
      let severity = (c.severity as string) ?? "info";
      if (finalCategory === "Position Economics") {
        if (titleLower.includes("impermanent loss") || titleLower.includes("yield source") || titleLower.includes("yield sustain") || titleLower.includes("emission")) severity = "info";
        else if (titleLower.includes("token risk") && severity === "info") severity = "low";
      }
      if ((titleLower.includes("frontend") || titleLower.includes("phishing")) && (severity === "critical" || severity === "high")) severity = "medium";
      return { ...c, category: finalCategory, severity };
    });

    // Inject hardcoded canonical checks that AI consistently skips or gets wrong.
    // These are derived entirely from on-chain data we already have — no AI needed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hardcodedChecks: any[] = [];

    // ── Source Verification ───────────────────────────────────────────────────
    // We already know isVerified for every contract. Inject a check so it always shows.
    const hasSourceCheck = normalizedChecks.some((c) => typeof c.title === "string" && (c.title.toLowerCase().includes("source") || c.title.toLowerCase().includes("verified") || c.title.toLowerCase().includes("unverified")));
    if (!hasSourceCheck) {
      const unverifiedContracts = contractRisks.filter((c) => c.isVerified === false);
      if (unverifiedContracts.length > 0) {
        hardcodedChecks.push({
          category: "Protocol Security",
          title: "Unverified contract source code",
          severity: "high",
          finding: `${unverifiedContracts.length} contract(s) have no verified source code on the block explorer`,
          info: `Contracts without public source code cannot be independently audited. Anyone depositing into this position cannot verify what the contract actually does. Unverified contracts are a major red flag. Affected addresses: ${unverifiedContracts.map((c) => c.address).join(", ")}`,
          laymanTerms: "When a smart contract has no public source code, you are trusting the developer completely — you cannot see what the code actually does. This is like sending money to a black box.",
          learnMoreUrl: `https://${chain === "base" ? "basescan" : "etherscan"}.io`,
        });
      } else if (contractRisks.some((c) => c.isVerified)) {
        hardcodedChecks.push({
          category: "Protocol Security",
          title: `Source code verified on ${chain === "base" ? "Basescan" : "Etherscan"}`,
          severity: "low",
          finding: "All contracts touched in this transaction have verified open-source code",
          info: "Verified source code means anyone can read exactly what the contract does. Security researchers, auditors, and users can all check the code independently. This is a basic requirement for trustworthy DeFi.",
          laymanTerms: "The code running these contracts is fully public — anyone can check it. This is the minimum standard for a trustworthy DeFi product.",
          learnMoreUrl: `https://${chain === "base" ? "basescan" : "etherscan"}.io`,
        });
      }
    }

    // ── Chain / Network Security ──────────────────────────────────────────────
    // Inject chain-level risk so it always shows up. Derived from chain param.
    const hasChainCheck = normalizedChecks.some((c) => typeof c.title === "string" && (c.title.toLowerCase().includes("sequencer") || c.title.toLowerCase().includes("network") || c.title.toLowerCase().includes("l2") || c.title.toLowerCase().includes("chain")));
    if (!hasChainCheck) {
      if (chain === "base") {
        hardcodedChecks.push({
          category: "Governance & Control",
          title: "Base L2 sequencer dependency",
          severity: "low",
          finding: "Base is a Coinbase-operated single-sequencer Optimistic Rollup",
          info: "Base uses a single sequencer run by Coinbase to order transactions. If the sequencer goes offline, transactions are delayed but funds are never at risk — you can always exit via L1. The 7-day fraud proof window means Ethereum itself is the final security backstop.",
          laymanTerms: "Base is a faster, cheaper version of Ethereum run by Coinbase. If Coinbase's system goes down, your transactions pause but your money stays safe — you can always move it back to Ethereum directly.",
          learnMoreUrl: "https://docs.base.org/docs/base-contracts",
        });
      } else {
        hardcodedChecks.push({
          category: "Governance & Control",
          title: "Ethereum L1 — highest security",
          severity: "low",
          finding: "Transaction is on Ethereum mainnet — maximum decentralisation and security",
          info: "Ethereum is the most battle-tested and decentralised smart contract platform. No sequencer risk, no bridge risk for native assets. The trade-off is higher gas costs.",
          laymanTerms: "Ethereum is the original blockchain and the most secure. Using it directly means you are not depending on any company to keep things running.",
          learnMoreUrl: "https://ethereum.org/en/developers/docs/networks/",
        });
      }
    }

    // ── Token Risks per asset ─────────────────────────────────────────────────
    // Derived from assetRisks (already built from KNOWN_ASSETS). One row per asset
    // where AI hasn't already produced a token risk check for that symbol.
    for (const asset of assetRisks) {
      const symbol = asset.symbol.toLowerCase();
      const aiAlreadyCovered = normalizedChecks.some((c) => {
        const t = (c.title as string ?? "").toLowerCase();
        return (t.includes("token") || t.includes("risk")) && t.includes(symbol);
      });
      if (aiAlreadyCovered) continue;
      const alreadyHardcoded = hardcodedChecks.some((c) => {
        const t = (c.title as string ?? "").toLowerCase();
        return t.includes(symbol);
      });
      if (alreadyHardcoded) continue;
      const severity = asset.trustLevel === "trusted" ? "low" : asset.trustLevel === "caution" ? "medium" : "high";
      const topNote = asset.riskNotes[0] ?? "No additional risk notes";
      hardcodedChecks.push({
        category: "Position Economics",
        title: `${asset.symbol} — token risk`,
        severity,
        finding: severity === "low"
          ? `${asset.symbol} (${asset.name}) — canonical, well-established token`
          : `${asset.symbol} (${asset.name}) — ${asset.assetType} with elevated risk`,
        info: asset.riskNotes.slice(0, 2).join(" "),
        laymanTerms: severity === "low"
          ? `${asset.symbol} is a well-known, widely-used token. It carries the standard risks of any digital asset but is not considered high risk on its own.`
          : `${asset.symbol} carries extra risk because: ${topNote}`,
        learnMoreUrl: `https://${chain === "base" ? "basescan" : "etherscan"}.io/token/${asset.address}`,
      });
    }

    // ── Impermanent Loss — always inject "info" for 2-token LP positions ──────
    const hasILCheck = normalizedChecks.some((c) => typeof c.title === "string" && (c.title.toLowerCase().includes("impermanent") || c.title.toLowerCase().includes("il ")));
    if (!hasILCheck && assetRisks.length >= 2) {
      const symbols = assetRisks.map((a) => a.symbol).join(" / ");
      const isTightRange = !!(detectedPair);
      hardcodedChecks.push({
        category: "Position Economics",
        title: "Impermanent loss exposure",
        severity: "info",
        finding: `${symbols} pair — IL risk present${isTightRange ? " on concentrated liquidity position" : ""}`,
        info: isTightRange
          ? "Concentrated liquidity positions amplify returns when price is in range but amplify impermanent loss when price moves out of range. If one token moves sharply, you end up holding more of the falling token and less of the rising one."
          : "Providing liquidity means you hold both tokens as a pair. If one token's price moves significantly relative to the other, you end up with less total value than if you had held the tokens separately. This is called impermanent loss.",
        laymanTerms: `If ${assetRisks[0]?.symbol ?? "token A"} and ${assetRisks[1]?.symbol ?? "token B"} move in opposite directions, the pool automatically rebalances and you end up with less total value than if you had just held them. It's the main trade-off of being a liquidity provider.`,
        learnMoreUrl: "https://academy.binance.com/en/articles/impermanent-loss-explained",
      });
    }

    // ── Withdrawal / Exit ─────────────────────────────────────────────────────
    const hasWithdrawalCheck = normalizedChecks.some(
      (c) => typeof c.title === "string" && (c.title.toLowerCase().includes("withdrawal") || c.title.toLowerCase().includes("exit"))
    );
    const hasKnownPool = contractRisks.some((c) => c.poolType) || !!detectedProtocol;
    if (!hasWithdrawalCheck && hasKnownPool) {
      hardcodedChecks.push({
        category: "Pool Security",
        title: "Withdrawal / Exit",
        severity: "low",
        finding: "No locks, queues, or delays on exiting the position",
        info: "Standard AMM pools let you remove liquidity at any time with no waiting period or exit penalty. Your funds are not locked.",
        laymanTerms: "You can take your money out whenever you want. There is no waiting period, no queue, and no fee to exit beyond normal network gas costs.",
        learnMoreUrl: undefined,
      });
    }

    // ── Uniswap V4 structural risks ───────────────────────────────────────────
    const isV4 = contractRisks.some((c) => c.poolType === "uniswap-v4") ||
      (detectedProtocol?.toLowerCase().includes("uniswap v4") ?? false);
    if (isV4) {
      const hasHooksCheck = normalizedChecks.some((c) => typeof c.title === "string" && c.title.toLowerCase().includes("hook"));
      if (!hasHooksCheck) {
        hardcodedChecks.push({
          category: "Pool Security",
          title: "V4 Hook risk",
          severity: "medium",
          finding: "Uniswap V4 pools can attach custom hook contracts that execute on every swap and liquidity change",
          info: "Hooks are arbitrary smart contracts that run before and after every pool action. A malicious or buggy hook could drain funds, block withdrawals, or manipulate prices. Always verify what hook (if any) is attached to the pool before depositing.",
          laymanTerms: "Think of hooks like a plugin that runs automatically every time anyone touches the pool. If the plugin is broken or malicious, it can affect your money. Always check whether there is a hook and who controls it.",
          learnMoreUrl: "https://docs.uniswap.org/contracts/v4/concepts/hooks",
        });
      }
      const hasSingletonCheck = normalizedChecks.some((c) => typeof c.title === "string" && c.title.toLowerCase().includes("singleton"));
      if (!hasSingletonCheck) {
        hardcodedChecks.push({
          category: "Protocol Security",
          title: "Singleton PoolManager",
          severity: "medium",
          finding: "All V4 liquidity lives in one contract — a bug or exploit affects every pool simultaneously",
          info: "Unlike V3 where each pool is a separate contract, V4 stores all liquidity in a single PoolManager. This improves gas efficiency but concentrates risk: a vulnerability in the PoolManager could expose every V4 pool at once. The contract has been audited extensively but the risk is structurally different from V3.",
          laymanTerms: "In V3, every pool had its own vault. In V4, all pools share one giant vault. If someone finds a way to break into that vault, all pools are at risk at once rather than just one.",
          learnMoreUrl: "https://docs.uniswap.org/contracts/v4/concepts/poolmanager",
        });
      }
      const hasGovernanceCheck = normalizedChecks.some((c) => typeof c.title === "string" && c.title.toLowerCase().includes("governance"));
      if (!hasGovernanceCheck) {
        hardcodedChecks.push({
          category: "Governance & Control",
          title: "Uniswap DAO governance",
          severity: "low",
          finding: "Protocol parameters controlled by Uniswap DAO via timelock — no single wallet admin",
          info: "Uniswap V4 is governed by UNI token holders through on-chain governance with a timelock delay. No single wallet or team can change the protocol unilaterally. This is considered best practice for DeFi governance.",
          laymanTerms: "No single person or company controls Uniswap. Changes to the protocol require a public vote by UNI token holders and a waiting period before anything happens. This is one of the safer governance setups in DeFi.",
          learnMoreUrl: "https://gov.uniswap.org",
        });
      }
    }

    const allChecks = [...hardcodedChecks, ...normalizedChecks];

    // Apply AI check deductions now that categories are normalized
    for (const check of allChecks) {
      const table = AI_DEDUCTIONS[check.category as string] ?? AI_DEDUCTIONS["Protocol Security"];
      riskScore -= table[check.severity as RiskLevel] ?? 0;
    }
    // Penalty for thin analysis — if AI produced fewer than 3 checks, cap the score
    // so we never show 95+ when we barely analysed anything.
    if (normalizedChecks.length < 3) riskScore = Math.min(riskScore, 75);
    // Penalty for unknown pool — couldn't identify pool type, analysis is incomplete.
    if (!contractRisks.some((c) => c.poolType)) riskScore = Math.min(riskScore, 80);

    riskScore = Math.max(0, Math.min(100, riskScore));

    // Fix #6: derive overallRisk from the live riskScore so cache hits can't show a stale label.
    // On a fresh AI call, ai.overallRisk and the score will agree. On a cache hit, the score
    // is always recomputed from fresh on-chain findings, so we must re-derive the label.
    const derivedOverallRisk: RiskLevel =
      riskScore >= 80 ? "low" :
      riskScore >= 60 ? "medium" :
      riskScore >= 40 ? "high" : "critical";

    return NextResponse.json({
      txHash,
      chain,
      summary,
      overallRisk: derivedOverallRisk,
      riskScore,
      positionOverview,
      contracts: contractRisks,
      assets: assetRisks,
      stackedRisks: ai.stackedRisks,
      aiNarrative: ai.narrative,
      sources: ai.sources,
      audits: ai.audits,
      exploits,
      activeProposals,
      vulnerabilityChecks: allChecks,
      scenariosThatCanGoWrong: ai.scenariosThatCanGoWrong,
      howToProtectYourself: ai.howToProtectYourself,
      protocolFlow: flow ? { name: flow.flowName, steps: flow.steps, callout: flow.callout } : null,
      protocolDocs: flow ? flow.docs : null,
    });
  } catch (err: unknown) {
    console.error("Risk analysis error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
