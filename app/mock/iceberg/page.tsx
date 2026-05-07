"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  MOCK,
  CATEGORY_ORDER,
  CATEGORY_ICON,
  SEVERITY_DOT,
  SEVERITY_PILL,
  SEVERITY_ICON,
  type RiskLevel,
  type YIFFCategory,
} from "../mockData";

// ICEBERG (v2): cool palette, outline iceberg, journey-style Position Map,
// docs inside Protocol card, flat YIFF Vulnerability Assessment.

const BG = "bg-[#F4F7FA]";
const SURFACE = "bg-white";
const PRIMARY = "#C8302B";
const ICE_LIGHT = "#A8D5E2";
const ICE_DARK = "#1E4E6E";
const ICE_MID = "#5B96B5";
const INK = "text-[#1B1B2F]";
const MUTED = "text-[#5B6B7E]";

const SEVERITY_LABEL_CONCERN: Record<RiskLevel, string> = {
  critical: "CRITICAL CONCERN",
  high: "HIGH CONCERN",
  medium: "MEDIUM CONCERN",
  low: "LOW CONCERN",
  info: "INFO",
};

function verdict(score: number) {
  if (score >= 80) return { text: "Looks clean", emoji: "😎", colour: "text-emerald-700 bg-emerald-50" };
  if (score >= 60) return { text: "Read carefully", emoji: "🤔", colour: "text-yellow-700 bg-yellow-50" };
  if (score >= 40) return { text: "I wouldn't", emoji: "😬", colour: "text-orange-700 bg-orange-50" };
  return { text: "Stay away", emoji: "🙀", colour: "text-red-700 bg-red-50" };
}

const PROTOCOL_FLOW = [
  { step: 1, title: "Hold pair tokens", icon: "💱", status: "done", detail: "WETH + USDC in your wallet" },
  { step: 2, title: "Add liquidity", icon: "➕", status: "current", detail: "This transaction. LP NFT minted." },
  { step: 3, title: "Stake in Gauge", icon: "🌾", status: "missing", detail: "Earns AERO token emissions (swap fees go to veAERO voters)" },
  { step: 4, title: "Lock as veAERO", icon: "🔒", status: "optional", detail: "Earn weekly voting rewards by directing emissions to pools" },
  { step: 5, title: "Claim rewards", icon: "💰", status: "recurring", detail: "Claim AERO emissions and swap fees whenever you like" },
];

const PROTOCOL_DOCS = {
  poolDocs: "https://aerodrome.finance/docs",
  app: "https://aerodrome.finance/pools",
};

export default function IcebergMock() {
  return (
    <div className={`min-h-screen ${BG}`}>
      <StickyBar />
      <main className="mx-auto max-w-6xl px-6 pt-6 pb-20">
        <Header />
        <SearchBar />
        <HeroRow />
        <PositionMap />
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <VulnerabilityAssessment />
          </div>
          <div className="space-y-6">
            <AssetAnalysis />
            <CompoundingRisks />
          </div>
        </div>
        <Footer />
      </main>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <div className="flex items-center justify-between pb-4">
      <Link href="/mock" className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F8F1E2]">
          <Image src="/cat-dad.png" alt="" width={44} height={44} className="rounded-lg" />
        </div>
        <div>
          <div className={`text-xl font-bold leading-none ${INK}`}>Iceberg</div>
          <div className={`mt-0.5 text-xs ${MUTED}`}>The risk beneath your yield</div>
        </div>
      </Link>
      <a
        href="https://x.com/CatDad0x"
        target="_blank"
        rel="noreferrer"
        className={`rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs ${MUTED} hover:border-slate-300`}
      >
        Built by @CatDad0x ↗
      </a>
    </div>
  );
}

function SearchBar() {
  return (
    <div className={`flex items-center gap-2 rounded-2xl ${SURFACE} p-3 shadow-sm`}>
      <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <option>🔵 Base</option>
        <option>💎 Ethereum</option>
      </select>
      <input
        defaultValue={MOCK.txHash}
        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700"
      />
      <button className="rounded-xl px-5 py-2 text-sm font-medium text-white" style={{ background: PRIMARY }}>
        Analyze
      </button>
    </div>
  );
}

function StickyBar() {
  const v = verdict(MOCK.riskScore);
  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-[#F4F7FA]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2.5 text-sm">
        <div className="flex items-center gap-3">
          <MiniIcebergOutline score={MOCK.riskScore} />
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${INK}`}>{MOCK.riskScore}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.colour}`}>
              {v.emoji} {v.text}
            </span>
            <span className={`${MUTED} text-xs`}>
              {MOCK.protocol} · {MOCK.pair}
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-3 text-xs ${MUTED}`}>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> 9 ok</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" /> 3 caveats</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> 0 critical</span>
        </div>
      </div>
    </div>
  );
}

// ─── Hero Row: iceberg score + 3 stat cards ─────────────────────────────────

function HeroRow() {
  const v = verdict(MOCK.riskScore);
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
      {/* Iceberg score card: horizontal layout, matches other 3 cards in height */}
      <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
        <div className={`text-xs uppercase tracking-wide ${MUTED}`}>Iceberg Score</div>
        <div className="mt-3 flex items-center gap-4">
          <BigIcebergOutline score={MOCK.riskScore} />
          <div className="flex-1 min-w-0">
            <div className={`text-3xl font-bold leading-none ${INK}`}>
              {MOCK.riskScore}
              <span className={`text-base ${MUTED}`}>/100</span>
            </div>
            <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.colour}`}>
              {v.emoji} {v.text}
            </span>
            <div className={`mt-2 text-[11px] ${MUTED} leading-relaxed`}>
              0 critical<br />3 caveats<br />9 ok
            </div>
          </div>
        </div>
      </div>

      <ProtocolCard />
      <PoolCard />
      <ChainCard />
    </div>
  );
}

function ProtocolCard() {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm flex flex-col`}>
      <Label icon="🏛">Protocol</Label>
      <div className={`mt-3 text-base font-semibold ${INK}`}>Aerodrome SlipStream</div>
      <div className={`text-xs ${MUTED}`}>Concentrated liquidity DEX</div>
      <div className="mt-3 flex flex-wrap gap-1.5 pt-3 border-t border-slate-100">
        <DocChip href={PROTOCOL_DOCS.poolDocs}>Docs</DocChip>
        <DocChip href={PROTOCOL_DOCS.app}>App</DocChip>
      </div>
    </div>
  );
}

function PoolCard() {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <Label icon="💧">Pool</Label>
      <div className={`mt-3 text-base font-semibold ${INK}`}>{MOCK.pair}</div>
      <div className={`text-xs ${MUTED}`}>{MOCK.feePercent}% fee tier</div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <a
          href="https://basescan.org/address/0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] hover:underline"
          style={{ color: ICE_DARK }}
        >
          0xb2cc22…59dc59 ↗
        </a>
      </div>
    </div>
  );
}

function ChainCard() {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <Label icon="🔵">Chain</Label>
      <div className={`mt-3 text-base font-semibold ${INK}`}>Base</div>
      <div className={`text-xs ${MUTED}`}>Coinbase L2 Optimistic Rollup</div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <a href={MOCK.explorerTxUrl} target="_blank" rel="noreferrer" className="text-[11px] hover:underline" style={{ color: ICE_DARK }}>
          View transaction ↗
        </a>
      </div>
    </div>
  );
}

function DocChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] hover:border-slate-300 hover:text-slate-900"
      style={{ color: ICE_DARK }}
    >
      {children} ↗
    </a>
  );
}

function Label({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-sm">{icon}</span>
      <span className={`text-xs uppercase tracking-wide ${MUTED}`}>{children}</span>
    </div>
  );
}

// ─── Position Map: horizontal journey ────────────────────────────────────────

function PositionMap() {
  return (
    <div className={`mt-6 ${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>🗺️</span>
          <h2 className={`text-base font-semibold ${INK}`}>Position Map</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            Aerodrome flow
          </span>
        </div>
        <div className={`text-[11px] ${MUTED}`}>1 step missing on your position</div>
      </div>

      <Journey />

      <div className="mt-5 rounded-xl bg-slate-50 p-3">
        <div className="flex items-start gap-2">
          <span className="text-base">💡</span>
          <div className="text-xs leading-relaxed text-slate-700">
            <span className="font-semibold">You are at step 2.</span> Your LP NFT is sitting in your wallet earning swap fees only.
            Step 3 (staking it in the Aerodrome Gauge) would add AERO emissions on top, with no extra risk to the underlying position.
            Most users skip this and leave 30 to 60 percent of their yield on the table.
            <a href={PROTOCOL_DOCS.poolDocs} target="_blank" rel="noreferrer" className="ml-1 hover:underline" style={{ color: ICE_DARK }}>
              How to stake →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Journey() {
  return (
    <div className="mt-5 relative">
      {/* Connector line behind the steps */}
      <div className="absolute left-0 right-0 top-7 h-0.5 bg-slate-200" />
      <div
        className="absolute left-0 top-7 h-0.5"
        style={{
          width: `${((PROTOCOL_FLOW.findIndex((s) => s.status === "current") + 0.5) / PROTOCOL_FLOW.length) * 100}%`,
          background: ICE_DARK,
        }}
      />

      <div className="relative grid grid-cols-5 gap-2">
        {PROTOCOL_FLOW.map((s) => (
          <JourneyStep key={s.step} step={s} />
        ))}
      </div>
    </div>
  );
}

function JourneyStep({ step }: { step: typeof PROTOCOL_FLOW[number] }) {
  const config =
    step.status === "done"
      ? { ring: `ring-2 ring-emerald-500`, bg: "bg-emerald-500", text: "text-white", label: "Done", labelColour: "text-emerald-700" }
      : step.status === "current"
      ? { ring: `ring-4 ring-blue-200`, bg: "bg-blue-600", text: "text-white", label: "You are here", labelColour: "text-blue-700" }
      : step.status === "missing"
      ? { ring: `ring-2 ring-yellow-400`, bg: "bg-yellow-400", text: "text-white", label: "Missing", labelColour: "text-yellow-800" }
      : step.status === "optional"
      ? { ring: `ring-2 ring-slate-300`, bg: "bg-white", text: "text-slate-400", label: "Optional", labelColour: "text-slate-500" }
      : { ring: `ring-2 ring-slate-200`, bg: "bg-white", text: "text-slate-500", label: "Recurring", labelColour: "text-slate-500" };

  return (
    <div className="flex flex-col items-center text-center">
      <div className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full ${config.bg} ${config.ring} ${config.text} text-xl shadow-sm`}>
        {step.icon}
      </div>
      <div className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${config.labelColour}`}>
        {config.label}
      </div>
      <div className={`mt-1 text-xs font-semibold ${INK} leading-tight`}>{step.title}</div>
      <div className={`mt-0.5 text-[10px] ${MUTED} leading-tight px-1`}>{step.detail}</div>
    </div>
  );
}

// ─── Vulnerability Assessment (flat YIFF, with legend) ───────────────────────

function VulnerabilityAssessment() {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className={`text-base font-semibold ${INK}`}>Vulnerability Assessment</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {MOCK.checks.length} checks
          </span>
        </div>
        <div className={`text-[11px] ${MUTED}`}>Tap a row for details</div>
      </div>

      {/* Severity legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px]">
        <span className={`uppercase tracking-wide ${MUTED}`}>Concern level:</span>
        <LegendDot colour="bg-red-500" label="Critical" />
        <LegendDot colour="bg-orange-500" label="High" />
        <LegendDot colour="bg-yellow-400" label="Medium" />
        <LegendDot colour="bg-emerald-500" label="Low" />
        <LegendDot colour="bg-slate-300" label="Info" />
        <span className={`ml-auto ${MUTED}`}>Lower is better</span>
      </div>

      <div className="mt-4 space-y-2">
        {CATEGORY_ORDER.map((cat) => {
          const checks = MOCK.checks.filter((c) => c.category === cat);
          if (checks.length === 0) return null;
          return <CategoryGroup key={cat} category={cat} checks={checks} />;
        })}
      </div>
    </div>
  );
}

function LegendDot({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${colour}`} />
      <span className="text-slate-700">{label}</span>
    </span>
  );
}

function CategoryGroup({ category, checks }: { category: YIFFCategory; checks: typeof MOCK.checks }) {
  return (
    <details className="rounded-xl border border-slate-200" open>
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
        <div className="flex items-center gap-2">
          <span className="text-base">{CATEGORY_ICON[category]}</span>
          <span className={`text-sm font-semibold ${INK}`}>{category}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
            {checks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {checks.map((c, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${SEVERITY_DOT[c.severity]}`} />
          ))}
        </div>
      </summary>
      <div className="border-t border-slate-100">
        {checks.map((c, i) => (
          <CheckRow key={i} check={c} />
        ))}
      </div>
    </details>
  );
}

function CheckRow({ check }: { check: typeof MOCK.checks[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${pillIconColour(check.severity)}`}>
          {SEVERITY_ICON[check.severity]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-medium ${INK}`}>{check.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${SEVERITY_PILL[check.severity]}`}>
              {SEVERITY_LABEL_CONCERN[check.severity]}
            </span>
          </div>
          <div className={`mt-0.5 text-xs ${MUTED} truncate`}>{check.oneLine}</div>
        </div>
        <span className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="ml-9 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            {check.info}
          </div>
          {check.learnMoreUrl && (
            <a
              href={check.learnMoreUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-9 mt-2 inline-block text-xs hover:underline"
              style={{ color: ICE_DARK }}
            >
              Learn more →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function pillIconColour(level: RiskLevel): string {
  if (level === "critical" || level === "high") return "text-red-600 bg-red-50";
  if (level === "medium") return "text-orange-600 bg-orange-50";
  if (level === "low") return "text-emerald-600 bg-emerald-50";
  return "text-slate-500 bg-slate-100";
}

// ─── Side cards ──────────────────────────────────────────────────────────────

function AssetAnalysis() {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center gap-2">
        <span>💰</span>
        <h2 className={`text-base font-semibold ${INK}`}>Assets ({MOCK.assets.length})</h2>
      </div>
      <div className="mt-3 space-y-3">
        {MOCK.assets.map((a) => (
          <div key={a.address} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-600">✓</span>
              <span className={`text-sm font-semibold ${INK}`}>{a.symbol}</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">TRUSTED</span>
            </div>
            <div className={`mt-0.5 ml-8 text-xs ${MUTED}`}>{a.name}</div>
            <a
              href={`https://basescan.org/address/${a.address}`}
              target="_blank"
              rel="noreferrer"
              className="ml-8 mt-1 inline-block font-mono text-[11px] hover:underline"
              style={{ color: ICE_DARK }}
            >
              {a.address.slice(0, 6)}…{a.address.slice(-4)} · Basescan ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompoundingRisks() {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center gap-2">
        <span>⚡</span>
        <h2 className={`text-base font-semibold ${INK}`}>Compounding Risks</h2>
      </div>
      <ol className={`mt-3 space-y-2 text-xs leading-relaxed ${MUTED}`}>
        <li>1. Active management required. Out of range means no fees plus IL realised on rebalance.</li>
        <li>2. Centralised stablecoin exposure. Circle blacklist applies to the USDC half.</li>
        <li>3. Frontend phishing risk. Bookmark aerodrome.finance; two prior DNS hijacks.</li>
      </ol>
    </div>
  );
}

function Footer() {
  return (
    <div className={`mt-12 flex items-center justify-between border-t border-slate-200 pt-6 text-xs ${MUTED}`}>
      <span>Iceberg · Not financial advice · Verify all findings independently</span>
      <a href="https://x.com/CatDad0x" target="_blank" rel="noreferrer" className="hover:underline">
        Built by @CatDad0x ↗
      </a>
    </div>
  );
}

// ─── Outline Iceberg SVGs ────────────────────────────────────────────────────

/**
 * Outline iceberg matching reference style #3.
 * Three navy-stroked peaks above the waterline; two dashed light-blue
 * inverted triangles below; short horizontal dash marks on the waterline.
 *
 * Score scaling: higher score grows the peaks taller and shrinks the
 * underwater depth. Lower score does the opposite. Waterline stays fixed.
 */
function BigIcebergOutline({ score }: { score: number }) {
  return <IcebergSVG score={score} size={130} strokeAbove={2} strokeBelow={1.6} />;
}

function MiniIcebergOutline({ score }: { score: number }) {
  return <IcebergSVG score={score} size={36} strokeAbove={4} strokeBelow={3} compact />;
}

function IcebergSVG({
  score,
  size,
  compact = false,
}: {
  score: number;
  size: number;
  strokeAbove?: number;
  strokeBelow?: number;
  compact?: boolean;
}) {
  const VB = 200;
  const WATERLINE = 110;
  const t = Math.max(0, Math.min(1, score / 100));

  // Peak heights scale with score. At 0 score, peaks are zero (nothing above water).
  // At 100 score, peaks are full height.
  const peakScale = t;

  // Underwater depth scales inverse to score. Always at least the minimum depth
  // visible (so even at 100 score there's some underwater mass shown).
  const depthScale = 0.45 + (1 - t) * 0.55;

  // Three peaks sharing a baseline at the waterline.
  const p1Apex = WATERLINE - 48 * peakScale; // small left
  const v1 = WATERLINE - 22 * peakScale;
  const p2Apex = WATERLINE - 78 * peakScale; // tallest middle
  const v2 = WATERLINE - 32 * peakScale;
  const p3Apex = WATERLINE - 58 * peakScale; // medium right

  // Closed path so we can fill it.
  const abovePath = `M 50,${WATERLINE} L 72,${p1Apex} L 88,${v1} L 110,${p2Apex} L 132,${v2} L 152,${p3Apex} L 175,${WATERLINE} Z`;

  // Underwater triangles: outer (larger) + inner (smaller), both centred.
  const outerDepth = WATERLINE + 75 * depthScale;
  const innerDepth = WATERLINE + 58 * depthScale;

  const NAVY = "#2D4F88";
  const MID = "#6FAACE";
  const PALE = "#DCEAF5";

  const uid = `${score}-${size}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} className="shrink-0">
      <defs>
        <linearGradient id={`grad-above-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor={PALE} stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={`grad-below-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PALE} stopOpacity="0.7" />
          <stop offset="100%" stopColor={PALE} stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Underwater: drawn first so the waterline overlays cleanly.
          Outer triangle behind, inner triangle on top. Both filled + dashed outline. */}
      <polygon
        points={`50,${WATERLINE} 175,${WATERLINE} 112,${outerDepth}`}
        fill={`url(#grad-below-${uid})`}
        stroke={MID}
        strokeWidth={compact ? 2.5 : 1.6}
        strokeDasharray="5 4"
        strokeLinejoin="miter"
        opacity="0.9"
      />
      <polygon
        points={`75,${WATERLINE} 150,${WATERLINE} 112,${innerDepth}`}
        fill={`url(#grad-below-${uid})`}
        stroke={MID}
        strokeWidth={compact ? 2.5 : 1.6}
        strokeDasharray="5 4"
        strokeLinejoin="miter"
        opacity="0.85"
      />

      {/* Solid continuous waterline (not dashes!) */}
      <line x1="0" y1={WATERLINE} x2={VB} y2={WATERLINE} stroke={MID} strokeWidth={compact ? 2.5 : 1.8} />
      <line
        x1="0"
        y1={WATERLINE + 5}
        x2={VB}
        y2={WATERLINE + 5}
        stroke={PALE}
        strokeWidth={compact ? 1.5 : 1}
        opacity="0.7"
      />

      {/* Above-water peaks: only render if there's any height to show */}
      {peakScale > 0.02 && (
        <>
          <path
            d={abovePath}
            fill={`url(#grad-above-${uid})`}
            stroke={NAVY}
            strokeWidth={compact ? 3 : 2}
            strokeLinejoin="miter"
            strokeMiterlimit="10"
          />
          {/* Inner facet ridges suggesting 3D peaks */}
          {!compact && (
            <g stroke={NAVY} fill="none" opacity="0.55" strokeLinecap="round">
              {/* Back ridge of tallest peak */}
              <line x1="110" y1={p2Apex} x2="122" y2={WATERLINE - 8} strokeWidth="1.2" />
              {/* Back ridge of right peak */}
              <line x1="152" y1={p3Apex} x2="158" y2={WATERLINE - 6} strokeWidth="1" opacity="0.5" />
            </g>
          )}
        </>
      )}
    </svg>
  );
}
