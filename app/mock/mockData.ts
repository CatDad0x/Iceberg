// Shared hardcoded data for all three mock variants.
// No API calls. these mocks are for design iteration only.

export type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

export type YIFFCategory =
  | "Smart Contract: Platform"
  | "Smart Contract: Pool"
  | "Counterparty"
  | "Market & Financial";

export type VulnerabilityCheck = {
  category: YIFFCategory;
  title: string;
  severity: RiskLevel;
  oneLine: string; // NEW: short summary for collapsed row
  finding: string;
  info: string;
  learnMoreUrl?: string;
};

export type AssetRow = {
  address: string;
  symbol: string;
  name: string;
  trustLevel: "trusted" | "caution" | "danger";
  tag: string;
  notes: string[];
};

export const MOCK = {
  txHash: "0x19e9fe153c5cdebaea8816ed4ff766f1aa47bb552bd97adc68ec1544bd656adb",
  chain: "base" as const,
  protocol: "Aerodrome SlipStream (CL)",
  pair: "WETH / USDC",
  feePercent: 0.0646,
  positionType: "Concentrated Liquidity NFT (active management)",
  riskScore: 82,
  explorerTxUrl: "https://basescan.org/tx/0x19e9fe153c5cdebaea8816ed4ff766f1aa47bb552bd97adc68ec1544bd656adb",
  assets: [
    {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      name: "Wrapped Ether (Base)",
      trustLevel: "trusted" as const,
      tag: "Verified · Standard ERC20",
      notes: [
        "Canonical WETH on Base. predeploy, immutable",
        "Standard OP Stack WETH9 implementation",
        "1:1 redemption to native ETH on Base",
      ],
    },
    {
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      symbol: "USDC",
      name: "USD Coin (Base)",
      trustLevel: "trusted" as const,
      tag: "Verified · Stablecoin",
      notes: [
        "Native USDC on Base. issued directly by Circle (not bridged)",
        "Circle blacklist and freeze risk still applies",
        "Regulatory risk unchanged from mainnet USDC",
      ],
    },
  ] satisfies AssetRow[],
  checks: [
    {
      category: "Smart Contract: Platform",
      title: "Source Verification",
      severity: "low",
      oneLine: "Verified on Basescan",
      finding: "Pool contract is verified on Basescan",
      info: "The Aerodrome SlipStream pool, swap router, and related infrastructure are verified on Basescan and source code is publicly browsable. Verified source means anyone can review the on-chain logic before depositing.",
      learnMoreUrl: "https://basescan.org/address/0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59#code",
    },
    {
      category: "Smart Contract: Platform",
      title: "Audit Status",
      severity: "low",
      oneLine: "ChainSecurity + Spearbit; forked from Uniswap V3",
      finding: "Audited by ChainSecurity and Spearbit; SlipStream forked from Uniswap V3",
      info: "SlipStream is a concentrated-liquidity AMM forked from Uniswap V3 with Velodrome-style ve(3,3) incentives layered on top. Aerodrome's core contracts were forked from audited Velodrome v2 and re-audited by ChainSecurity and Spearbit, with no critical bugs reported. The codebase is mature and well-reviewed for a Base-native DEX.",
      learnMoreUrl: "https://github.com/aerodrome-finance/contracts",
    },
    {
      category: "Smart Contract: Platform",
      title: "Bug Bounty",
      severity: "low",
      oneLine: "Velodrome Immunefi up to $100k",
      finding: "Sister protocol Velodrome runs an Immunefi bounty up to $100k",
      info: "Velodrome (the upstream codebase Aerodrome forks from) runs a public Immunefi bug bounty paying up to $100,000 for critical smart-contract findings, co-funded with the Optimism Foundation. Aerodrome inherits the same code and benefits from this scrutiny, though the cap is modest relative to TVL.",
      learnMoreUrl: "https://immunefi.com/bounty/velodromefinance/",
    },
    {
      category: "Smart Contract: Platform",
      title: "Exploit History",
      severity: "info",
      oneLine: "No contract exploits; 2 frontend/DNS incidents (2023, 2025)",
      finding: "No smart-contract exploits; two frontend/DNS incidents (2023, 2025)",
      info: "Aerodrome's smart contracts have not been exploited. However, the protocol has suffered two separate front-end attacks. one in November 2023 and one in November 2025. both targeting the Web2 layer rather than on-chain code. LP positions held in the contract were not at risk in either incident.",
      learnMoreUrl: "https://rekt.news/",
    },
    {
      category: "Smart Contract: Pool",
      title: "Pool Maturity & Liquidity",
      severity: "low",
      oneLine: "Deep liquidity; mature WETH/USDC pair",
      finding: "Pool has deep liquidity and is one of the most-traded pairs on Base",
      info: "WETH/USDC on Aerodrome SlipStream consistently sits in the top 5 pools on Base by TVL and volume. Deep liquidity reduces slippage on entry/exit and lowers impermanent loss volatility from thin trading.",
    },
    {
      category: "Counterparty",
      title: "Admin Access",
      severity: "medium",
      oneLine: "Multisig governance; no individual key control",
      finding: "Protocol controlled by multisig with timelock on critical functions",
      info: "Aerodrome's admin functions are gated behind a multisig wallet with a timelock delay on parameter changes. There is no single EOA that can drain funds, but the multisig signers do have meaningful upgrade powers. Individual pools (including this one) cannot be paused arbitrarily.",
      learnMoreUrl: "https://docs.aerodrome.finance/governance",
    },
    {
      category: "Counterparty",
      title: "Oracle Dependency",
      severity: "low",
      oneLine: "No external oracle (TWAP only)",
      finding: "Pool uses internal Uniswap V3-style TWAP, no external oracle dependency",
      info: "Concentrated liquidity pools rely on the pool's own price as the oracle. There is no Chainlink or external feed that can be manipulated to drain the pool. TWAP manipulation requires moving large capital and is generally uneconomic on a deep pool.",
    },
    {
      category: "Counterparty",
      title: "Network Security",
      severity: "low",
      oneLine: "Base. Coinbase L2, Stage 1 rollup",
      finding: "Base is a Coinbase-operated Optimistic Rollup with Stage 1 decentralisation",
      info: "Base is operated by Coinbase, secured by Ethereum L1 fraud proofs. Sequencer is currently centralised at Coinbase, meaning short-term censorship is possible but theft is not. Force-include exit window applies if the sequencer goes down.",
      learnMoreUrl: "https://l2beat.com/scaling/projects/base",
    },
    {
      category: "Counterparty",
      title: "Frontend / Phishing Risk",
      severity: "medium",
      oneLine: "Two prior DNS hijack incidents. verify URL carefully",
      finding: "Aerodrome has been targeted by DNS/frontend attacks twice",
      info: "Always verify you're on aerodrome.finance directly. Bookmark it. Two separate frontend hijacks in 2023 and 2025 routed users to fake approval prompts. On-chain funds were not at risk but users who signed phishing transactions lost wallet contents.",
      learnMoreUrl: "https://aerodrome.finance",
    },
    {
      category: "Market & Financial",
      title: "Impermanent Loss Exposure",
      severity: "medium",
      oneLine: "Concentrated LP. high IL if WETH moves out of range",
      finding: "Concentrated liquidity amplifies IL when price moves outside your range",
      info: "Unlike a full-range Uni V2 pool, your capital is only earning fees while WETH price stays inside the tick range you set. Move outside the range and you hold 100% of one asset with no fees, plus realised IL. Active management or wider ranges reduce this.",
      learnMoreUrl: "https://docs.uniswap.org/concepts/protocol/concentrated-liquidity",
    },
    {
      category: "Market & Financial",
      title: "Yield Source",
      severity: "low",
      oneLine: "Trading fees + AERO emissions",
      finding: "Yield comes from swap fees plus AERO governance token emissions",
      info: "Real yield from swap fees is sustainable. AERO emission yield is paid in the protocol's own token and can decay as emissions taper. Track real-fee APR separately from emission APR. emission APR is not directly redeemable to USDC without a sell.",
    },
    {
      category: "Market & Financial",
      title: "Withdrawal / Exit",
      severity: "low",
      oneLine: "Permissionless exit; no lockup",
      finding: "Position is a freely transferable NFT; no lockup, no withdrawal queue",
      info: "Concentrated liquidity positions are ERC-721 NFTs you hold directly. You can decrease liquidity and collect fees at any block. No vesting, no cooldown, no exit queue.",
    },
  ] satisfies VulnerabilityCheck[],
};

export const CATEGORY_ORDER: YIFFCategory[] = [
  "Smart Contract: Platform",
  "Smart Contract: Pool",
  "Counterparty",
  "Market & Financial",
];

export const CATEGORY_ICON: Record<YIFFCategory, string> = {
  "Smart Contract: Platform": "🛠",
  "Smart Contract: Pool": "💧",
  "Counterparty": "🏛",
  "Market & Financial": "📊",
};

export const SEVERITY_DOT: Record<RiskLevel, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-400",
  low: "bg-emerald-500",
  info: "bg-slate-300",
};

export const SEVERITY_PILL: Record<RiskLevel, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-emerald-100 text-emerald-700",
  info: "bg-slate-100 text-slate-600",
};

export const SEVERITY_LABEL: Record<RiskLevel, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MED",
  low: "LOW",
  info: "INFO",
};

export const SEVERITY_ICON: Record<RiskLevel, string> = {
  critical: "✗",
  high: "✗",
  medium: "!",
  low: "✓",
  info: "ⓘ",
};
