// Per-protocol position-flow registry.
// Each entry describes the canonical sequence of steps a user takes within
// the protocol so we can show the user where they are in the flow and what
// they may have skipped (e.g. staking LP NFT in a gauge to earn emissions).
//
// Add new protocols here as we encounter them. Detection key matches
// against `positionOverview.protocol` (lowercased substring match).

export type FlowStepStatus = "done" | "current" | "missing" | "optional" | "recurring";

export type FlowStep = {
  step: number;
  title: string;
  icon: string;
  status: FlowStepStatus;
  detail: string;
};

export type ProtocolFlow = {
  protocolKey: string; // lowercased substring matched against positionOverview.protocol
  flowName: string;
  steps: FlowStep[];
  callout: string; // shown in the yellow "heads up" box explaining missing steps
  docs: { docs: string; app: string };
};

export const PROTOCOL_FLOWS: ProtocolFlow[] = [
  {
    protocolKey: "aerodrome",
    flowName: "Aerodrome flow",
    steps: [
      { step: 1, title: "Hold pair tokens", icon: "✓", status: "done", detail: "WETH + USDC in your wallet" },
      { step: 2, title: "Add liquidity", icon: "📍", status: "current", detail: "LP NFT minted" },
      { step: 3, title: "Stake in Gauge", icon: "💸", status: "missing", detail: "Earns AERO token emissions (swap fees go to veAERO voters)" },
      { step: 4, title: "Lock as veAERO", icon: "🔒", status: "optional", detail: "Earn weekly voting rewards by directing emissions to pools" },
      { step: 5, title: "Claim rewards", icon: "💰", status: "recurring", detail: "Claim AERO emissions and swap fees whenever you like" },
    ],
    callout:
      "Your LP NFT is sitting in your wallet but not staked in a gauge. Step 3 (staking in the Aerodrome Gauge) would earn you AERO token emissions on top of your position. Most users skip this and leave 30 to 60 percent of their yield on the table.",
    docs: { docs: "https://aerodrome.finance/docs", app: "https://aerodrome.finance/pools" },
  },
];

export function findProtocolFlow(protocolName: string | undefined): ProtocolFlow | undefined {
  if (!protocolName) return undefined;
  const needle = protocolName.toLowerCase();
  return PROTOCOL_FLOWS.find((p) => needle.includes(p.protocolKey));
}
