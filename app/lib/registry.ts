// YF Risk Tool: Classification Registry
// All addresses lowercase for consistent matching

export type Chain = "ethereum" | "base";

export type PoolType =
  | "uniswap-v2"
  | "uniswap-v3"
  | "curve-stableswap"
  | "curve-cryptoswap"
  | "balancer-weighted"
  | "velodrome-v2"
  | "aerodrome-v2"
  | "aerodrome-slipstream"
  | "unknown";

export type AssetType =
  | "native-eth"
  | "lsd"
  | "bridged"
  | "yield-bearing"
  | "stablecoin"
  | "standard-erc20";

export type BridgeType =
  | "layerzero"
  | "wormhole"
  | "base-native"
  | "arbitrum-native"
  | "across"
  | "stargate"
  | "unknown";

// ─── Pool Factories ─────────────────────────────────────────────────────────

export type PoolFactory = {
  name: string;
  poolType: PoolType;
  chain: Chain;
  factoryAddress: string;
};

export const POOL_FACTORIES: PoolFactory[] = [
  // Ethereum
  { name: "Uniswap v2", poolType: "uniswap-v2", chain: "ethereum", factoryAddress: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f" },
  { name: "Uniswap v3", poolType: "uniswap-v3", chain: "ethereum", factoryAddress: "0x1f98431c8ad98523631ae4a59f267346ea31f984" },
  { name: "Curve (main registry)", poolType: "curve-stableswap", chain: "ethereum", factoryAddress: "0x90e00ace148ca3b23ac1bc8c240c2a7dd9c2d7f5" },
  { name: "Curve factory v2", poolType: "curve-stableswap", chain: "ethereum", factoryAddress: "0xb9fc157394af804a3578134a6585c0dc9cc1bb4a" },
  { name: "Curve CryptoSwap factory", poolType: "curve-cryptoswap", chain: "ethereum", factoryAddress: "0xf18056bbd320e96a48e3fbf8bc061322531aac99" },
  { name: "Balancer v2 vault", poolType: "balancer-weighted", chain: "ethereum", factoryAddress: "0xba12222222228d8ba445958a75a0704d566bf2c8" },

  // Base
  { name: "Aerodrome v2", poolType: "aerodrome-v2", chain: "base", factoryAddress: "0x420dd381b31aef6683db6b902084cb0ffece40da" },
  { name: "Aerodrome SlipStream (CL)", poolType: "aerodrome-slipstream", chain: "base", factoryAddress: "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a" },
  { name: "Uniswap v3 (Base)", poolType: "uniswap-v3", chain: "base", factoryAddress: "0x33128a8fc17869897dce68ed026d694621f6fdfd" },
  { name: "Uniswap v2 (Base)", poolType: "uniswap-v2", chain: "base", factoryAddress: "0x8909dc15e40173ff4699343b6eb8132c65e18ec6" },
];

// ─── Known Protocol Contracts (routers, position managers, etc.) ─────────────

export type ProtocolContract = {
  name: string;
  protocol: string;
  role: "router" | "position-manager" | "voter" | "gauge-factory" | "vault";
  chain: Chain;
  address: string;
  riskNotes: string[];
};

export const PROTOCOL_CONTRACTS: ProtocolContract[] = [
  // Ethereum
  { name: "Uniswap v2 Router", protocol: "Uniswap v2", role: "router", chain: "ethereum", address: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", riskNotes: ["Stateless router: does not hold funds", "Immutable, no upgradeability"] },
  { name: "Uniswap v3 Router", protocol: "Uniswap v3", role: "router", chain: "ethereum", address: "0xe592427a0aece92de3edee1f18e0157c05861564", riskNotes: ["Stateless router", "Immutable"] },
  { name: "Uniswap v3 Position Manager (NFT)", protocol: "Uniswap v3", role: "position-manager", chain: "ethereum", address: "0xc36442b4a4522e871399cd717abdd847ab11fe88", riskNotes: ["Manages LP positions as NFTs", "Holds protocol fees during collection"] },

  // Base
  { name: "Aerodrome Router", protocol: "Aerodrome", role: "router", chain: "base", address: "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43", riskNotes: ["Stateless router: funds pass through, not held", "Routes swaps and liquidity adds across Aerodrome pools"] },
  { name: "Aerodrome Voter", protocol: "Aerodrome", role: "voter", chain: "base", address: "0x16613524e02ad97edfef371bc883f2f5d6c480a5", riskNotes: ["Controls AERO emissions to gauges", "DAO governance: veAERO holders vote weekly", "Can kill gauges, redirecting emissions"] },
  { name: "Aerodrome SlipStream NFT Position Manager", protocol: "Aerodrome SlipStream", role: "position-manager", chain: "base", address: "0x827922686190790b37229fd06084350e74485b72", riskNotes: ["Manages concentrated liquidity positions as NFTs (similar to Uniswap v3)", "You receive an NFT representing your LP position", "Position parameters (tick range, fee tier) are baked into the NFT", "Standard fork of Uniswap v3 NonfungiblePositionManager"] },
  { name: "Uniswap v3 Router (Base)", protocol: "Uniswap v3", role: "router", chain: "base", address: "0x2626664c2603336e57b271c5c0b26f421741e481", riskNotes: ["Stateless router", "Immutable"] },
  { name: "Uniswap v3 Position Manager (Base)", protocol: "Uniswap v3", role: "position-manager", chain: "base", address: "0x03a520b32c04bf3beef7beb72e919cf822ed34f1", riskNotes: ["Manages v3 positions as NFTs", "Standard Uniswap deployment"] },
];

// ─── Known Assets ────────────────────────────────────────────────────────────

export type KnownAsset = {
  symbol: string;
  name: string;
  assetType: AssetType;
  chain: Chain;
  address: string;
  decimals: number;
  underlyingProtocol?: string;
  bridgeType?: BridgeType;
  riskNotes: string[];
};

export const KNOWN_ASSETS: KnownAsset[] = [
  // ── Native ETH placeholder ──
  {
    symbol: "ETH",
    name: "Ether",
    assetType: "native-eth",
    chain: "ethereum",
    address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    decimals: 18,
    riskNotes: ["Native asset: no smart contract risk on the token itself"],
  },

  // ── WETH ──
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    assetType: "standard-erc20",
    chain: "ethereum",
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    decimals: 18,
    riskNotes: [
      "Canonical WETH: immutable, no admin, no upgradeability",
      "Battle-tested since 2017, holds tens of billions in TVL",
      "1:1 redemption to ETH always: no oracle, no rate manipulation",
    ],
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether (Base)",
    assetType: "standard-erc20",
    chain: "base",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    riskNotes: [
      "Canonical WETH on Base: predeploy, immutable",
      "Standard OP Stack WETH9 implementation",
      "1:1 redemption to native ETH on Base",
    ],
  },

  // ── LSDs on Ethereum ──
  {
    symbol: "wstETH",
    name: "Wrapped stETH (Lido)",
    assetType: "lsd",
    chain: "ethereum",
    address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    decimals: 18,
    underlyingProtocol: "Lido",
    riskNotes: [
      "Validator slashing can reduce the ETH redemption rate",
      "Lido smart contract risk: large, audited but complex",
      "stETH/ETH exchange rate is contract-controlled: oracle manipulation risk",
      "Withdrawal queue may delay exits during high-demand periods",
    ],
  },
  {
    symbol: "rETH",
    name: "Rocket Pool ETH",
    assetType: "lsd",
    chain: "ethereum",
    address: "0xae78736cd615f374d3085123a210448e74fc6393",
    decimals: 18,
    underlyingProtocol: "Rocket Pool",
    riskNotes: [
      "Validator slashing risk across distributed node operators",
      "Rocket Pool protocol smart contract risk",
      "Redemption rate is set by oracle: manipulation risk is lower than centralised LSDs",
    ],
  },
  {
    symbol: "cbETH",
    name: "Coinbase Wrapped Staked ETH",
    assetType: "lsd",
    chain: "ethereum",
    address: "0xbe9895146f7af43049ca1c1ae358b0541ea49704",
    decimals: 18,
    underlyingProtocol: "Coinbase",
    riskNotes: [
      "Custodial: Coinbase controls the underlying staked ETH",
      "Coinbase can pause or freeze the token (centralisation risk)",
      "Redemption rate set by Coinbase: less transparent than on-chain LSDs",
    ],
  },
  {
    symbol: "sfrxETH",
    name: "Staked Frax ETH",
    assetType: "lsd",
    chain: "ethereum",
    address: "0xac3e018457b222d93114458476f3e3416abbe38f",
    decimals: 18,
    underlyingProtocol: "Frax Finance",
    riskNotes: [
      "Frax protocol risk: multi-component system with governance complexity",
      "Validator slashing risk",
      "Frax Finance admin key risk: governance can affect redemption mechanics",
    ],
  },

  // ── Stablecoins on Ethereum ──
  {
    symbol: "USDC",
    name: "USD Coin",
    assetType: "stablecoin",
    chain: "ethereum",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
    riskNotes: [
      "Issued by Circle, the most regulated and reputable stablecoin issuer",
      "Backed 1:1 by cash and short-term US Treasuries; monthly attestations",
      "Circle can technically freeze sanctioned addresses; in practice this almost never affects ordinary users",
    ],
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    assetType: "stablecoin",
    chain: "ethereum",
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
    riskNotes: [
      "Centralised: Tether Ltd can blacklist addresses and issue/burn tokens",
      "Reserve transparency is limited: partial attestations only",
      "Regulatory risk: subject to US Treasury and DOJ scrutiny",
    ],
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    assetType: "stablecoin",
    chain: "ethereum",
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
    decimals: 18,
    riskNotes: [
      "MakerDAO governance risk: parameter changes via DAO vote",
      "Collateral risk: backed by a basket including centralised assets (USDC, WBTC)",
      "Smart contract complexity: one of the oldest and most complex DeFi protocols",
    ],
  },

  // ── Yield-bearing on Ethereum ──
  {
    symbol: "aUSDC",
    name: "Aave USDC",
    assetType: "yield-bearing",
    chain: "ethereum",
    address: "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c",
    decimals: 6,
    underlyingProtocol: "Aave v3",
    riskNotes: [
      "Aave smart contract risk: complex lending protocol",
      "USDC underlying centralisation risk (see USDC notes)",
      "Utilisation rate affects withdrawal speed: high utilisation can delay exits",
    ],
  },

  // ── wstETH bridged to Base ──
  {
    symbol: "wstETH",
    name: "Wrapped stETH (Base: bridged)",
    assetType: "bridged",
    chain: "base",
    address: "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452",
    decimals: 18,
    underlyingProtocol: "Lido",
    bridgeType: "base-native",
    riskNotes: [
      "Stacked risk: Lido validator slashing + Lido smart contract + Base native bridge + Base L2",
      "Base native bridge: 7-day withdrawal window to return to Ethereum",
      "Base Security Council can override fraud proofs: centralisation risk",
      "Exchange rate relies on Lido's oracle being correctly bridged to Base",
    ],
  },

  // ── USDC on Base (bridged) ──
  {
    symbol: "USDC",
    name: "USD Coin (Base)",
    assetType: "stablecoin",
    chain: "base",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
    riskNotes: [
      "Native USDC on Base, issued directly by Circle (not a bridged token)",
      "Same backing and reputation as mainnet USDC; widely considered the safest stablecoin",
      "Circle can technically freeze sanctioned addresses; in practice this almost never affects ordinary users",
    ],
  },
];

// ─── Bridge Signatures ───────────────────────────────────────────────────────

export type BridgeSignature = {
  bridgeType: BridgeType;
  name: string;
  functionSignatures: string[];
  knownContracts: Partial<Record<Chain, string[]>>;
  riskNotes: string[];
};

export const BRIDGE_SIGNATURES: BridgeSignature[] = [
  {
    bridgeType: "layerzero",
    name: "LayerZero OFT",
    functionSignatures: ["sendFrom(address,uint16,bytes,uint256,address,address,bytes)", "lzReceive(uint16,bytes,uint64,bytes)"],
    knownContracts: {
      ethereum: ["0x66a71dcef29a0ffbdbe3c6a460a3b5bc225cd675"],
      base: ["0xb6319cc6c8c27a8f5daf0dd3df91ea35c4720dd7"],
    },
    riskNotes: [
      "Security depends on the DVN (Decentralised Verifier Network) configuration",
      "If the OFT uses a permissioned DVN set, a small number of entities can forge messages",
      "Check who configured the DVN: protocol multisig or immutable?",
      "LayerZero v2 improves security but DVN trust assumptions remain",
    ],
  },
  {
    bridgeType: "wormhole",
    name: "Wormhole",
    functionSignatures: ["publishMessage(uint32,bytes,uint8)", "parseAndVerifyVM(bytes)"],
    knownContracts: {
      ethereum: ["0x98f3c9e6e3face36baad05fe09d375ef1464288b"],
      base: ["0xbebdb6c8ddC678FfA9f8748f85C815C556Dd8ac6"],
    },
    riskNotes: [
      "Guardian set of 19 nodes: 13/19 quorum can sign any message, including minting unbacked tokens",
      "Exploited for $320M in February 2022 (Solana bridge vulnerability)",
      "If guardian set is compromised, attacker can mint arbitrary amounts of bridged tokens",
      "Guardian set members are known entities but this remains a significant centralisation risk",
    ],
  },
  {
    bridgeType: "base-native",
    name: "Base Native Bridge (Optimism stack)",
    functionSignatures: ["depositETH(uint32,bytes)", "depositERC20(address,address,uint256,uint32,bytes)"],
    knownContracts: {
      ethereum: ["0x3154cf16ccdb4c6d922629664174b904d80f2c35", "0x49048044d57e1c92a77f79988d21fa8faf74e97e"],
      base: ["0x4200000000000000000000000000000000000010", "0x4200000000000000000000000000000000000007"],
    },
    riskNotes: [
      "7-day fraud proof window: funds take 7 days to fully exit to Ethereum",
      "Base Security Council (Coinbase + partners) can override fraud proofs with 2/2 multisig",
      "This means Coinbase can unilaterally intervene during the challenge window",
      "Standard withdrawals are safe but not trustless: governance risk remains",
    ],
  },
  {
    bridgeType: "across",
    name: "Across Protocol",
    functionSignatures: ["deposit(address,address,uint256,uint256,int64,uint32,bytes,uint256)"],
    knownContracts: {
      ethereum: ["0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5"],
      base: ["0x09aea4b2242abc8bb4bb78d537a67a245a7bec64"],
    },
    riskNotes: [
      "Relayer-based fast bridge: relayers front liquidity and are reimbursed",
      "Risk is lower than guardian-based bridges but depends on HubPool contract security",
      "UMA optimistic oracle used for dispute resolution: 2-hour challenge window",
      "Across contracts are upgradeable: check current admin and timelock",
    ],
  },
];

// ─── Pool Check Templates ────────────────────────────────────────────────────

export type CheckTemplate = {
  functionName: string;
  description: string;
  riskIfTrue?: string;
  riskIfFalse?: string;
};

export const POOL_CHECK_TEMPLATES: Record<PoolType, CheckTemplate[]> = {
  "uniswap-v2": [
    { functionName: "feeTo", description: "Fee recipient address", riskIfTrue: "Non-zero address receives a cut of all swap fees: check who controls it" },
    { functionName: "feeToSetter", description: "Who can change the fee recipient", riskIfTrue: "This address can redirect all protocol fees" },
  ],
  "uniswap-v3": [
    { functionName: "owner", description: "Pool owner / factory owner", riskIfTrue: "Can enable fee on pool, change tick spacing" },
    { functionName: "feeProtocol", description: "Protocol fee enabled", riskIfTrue: "Protocol fee is active: a portion of swap fees goes to the protocol" },
  ],
  "curve-stableswap": [
    { functionName: "is_killed", description: "Pool is killed (deposits disabled)", riskIfTrue: "Pool is killed: deposits disabled, only withdrawals allowed" },
    { functionName: "kill_me", description: "Kill switch function exists", riskIfTrue: "Admin can disable deposits at any time" },
    { functionName: "future_A", description: "Pending A parameter change (amplification)", riskIfTrue: "A ramp in progress: pool balance mechanics are actively changing, can affect prices" },
    { functionName: "admin_fee", description: "Admin fee percentage", riskIfTrue: "Admin receives a share of trading fees" },
    { functionName: "owner", description: "Pool owner", riskIfTrue: "Check if EOA or multisig: EOA with no timelock is highest risk" },
    { functionName: "future_owner", description: "Pending ownership transfer", riskIfTrue: "Ownership transfer queued: new owner has not yet accepted" },
  ],
  "curve-cryptoswap": [
    { functionName: "is_killed", description: "Pool is killed", riskIfTrue: "Pool is killed: only withdrawals" },
    { functionName: "admin_fee", description: "Admin fee", riskIfTrue: "Admin takes a share of fees" },
    { functionName: "allowed_extra_profit", description: "Profit parameter", riskIfTrue: "Parameter controls profit extraction mechanics: check if recently changed" },
    { functionName: "owner", description: "Pool owner", riskIfTrue: "Check if EOA vs multisig" },
  ],
  "balancer-weighted": [
    { functionName: "getSwapFeePercentage", description: "Swap fee rate" },
    { functionName: "getPausedState", description: "Is the pool paused", riskIfTrue: "Pool is paused: no swaps or joins possible" },
    { functionName: "getOwner", description: "Pool owner: can change swap fee", riskIfTrue: "Owner can raise swap fees, affecting LP returns" },
  ],
  "velodrome-v2": [
    { functionName: "isAlive", description: "Gauge is active", riskIfFalse: "Gauge is killed: no more VELO emissions to this pool" },
    { functionName: "voter", description: "Voter contract address", riskIfTrue: "Voter controls gauge weights and emissions: check who controls voter" },
    { functionName: "fee", description: "Pool swap fee" },
    { functionName: "factory", description: "Pool factory address" },
  ],
  "aerodrome-v2": [
    { functionName: "isAlive", description: "Gauge is active", riskIfFalse: "Gauge is killed: no more AERO emissions to this pool" },
    { functionName: "voter", description: "Voter contract address", riskIfTrue: "Voter contract controls gauge emissions: check admin of voter" },
    { functionName: "fee", description: "Pool swap fee" },
    { functionName: "factory", description: "Pool factory address" },
  ],
  "aerodrome-slipstream": [
    { functionName: "fee", description: "Pool fee tier (basis points)" },
    { functionName: "tickSpacing", description: "Pool tick spacing: affects how concentrated positions can be" },
    { functionName: "factory", description: "Pool factory address" },
    { functionName: "gauge", description: "Associated gauge contract", riskIfTrue: "Pool has a gauge: emissions can be killed via voter" },
  ],
  unknown: [],
};

// ─── Proxy Storage Slots (EIP-1967) ─────────────────────────────────────────

export const PROXY_SLOTS = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
};

// ─── Known Timelocks ─────────────────────────────────────────────────────────

export type KnownTimelock = {
  address: string;
  chain: Chain;
  protocol: string;
  delaySeconds: number;
};

export const KNOWN_TIMELOCKS: KnownTimelock[] = [
  { address: "0xbf1786c58a442da68769f8c4b88bde7fc15b53e6", chain: "ethereum", protocol: "Uniswap Governance", delaySeconds: 172800 },
  { address: "0x8392f6669292fa56123f71949b52d883ae57e225", chain: "ethereum", protocol: "Compound Governor Bravo", delaySeconds: 172800 },
  { address: "0xa6f2045a8dfa2b1a0c6fa3b9c39a32a51b0b25b3", chain: "ethereum", protocol: "Aave v3 Timelock", delaySeconds: 86400 },
];

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

export function findProtocolContract(address: string, chain: Chain): ProtocolContract | undefined {
  return PROTOCOL_CONTRACTS.find(
    (c) => c.address.toLowerCase() === address.toLowerCase() && c.chain === chain
  );
}

export function findPoolFactory(address: string, chain: Chain): PoolFactory | undefined {
  return POOL_FACTORIES.find(
    (f) => f.factoryAddress.toLowerCase() === address.toLowerCase() && f.chain === chain
  );
}

export function findKnownAsset(address: string, chain: Chain): KnownAsset | undefined {
  return KNOWN_ASSETS.find(
    (a) => a.address.toLowerCase() === address.toLowerCase() && a.chain === chain
  );
}

export function findBridgeByContract(address: string, chain: Chain): BridgeSignature | undefined {
  return BRIDGE_SIGNATURES.find((b) =>
    (b.knownContracts[chain] ?? []).some(
      (c) => c.toLowerCase() === address.toLowerCase()
    )
  );
}

export function findTimelock(address: string, chain: Chain): KnownTimelock | undefined {
  return KNOWN_TIMELOCKS.find(
    (t) => t.address.toLowerCase() === address.toLowerCase() && t.chain === chain
  );
}

export function getPoolChecks(poolType: PoolType): CheckTemplate[] {
  return POOL_CHECK_TEMPLATES[poolType] ?? [];
}
