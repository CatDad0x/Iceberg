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
  SEVERITY_LABEL,
  SEVERITY_ICON,
  type RiskLevel,
  type YIFFCategory,
} from "../mockData";

// PERSONAL. Cat Dad voice throughout. Penguin in header, score card, footer.
// "Cat Dad says..." verdict, signed footer. Highest personality dial.

const BG = "bg-[#F8F1E2]";
const SURFACE = "bg-white";
const PRIMARY = "#C8302B";
const SECONDARY = "#2B6FB8";
const ACCENT = "#E8628C"; // bowtie pink
const INK = "text-[#1B1B2F]";
const MUTED = "text-[#7A6B58]";

function verdict(score: number) {
  if (score >= 80) return { text: "Looks clean to me. Reasonable spot for a yield position.", emoji: "😎", colour: "text-emerald-700 bg-emerald-50", short: "Looks clean" };
  if (score >= 60) return { text: "Some caveats here. read the medium flags before you ape.", emoji: "🤔", colour: "text-yellow-700 bg-yellow-50", short: "Read carefully" };
  if (score >= 40) return { text: "I wouldn't park serious size here. Multiple risks stack up.", emoji: "😬", colour: "text-orange-700 bg-orange-50", short: "I wouldn't" };
  return { text: "Stay away. The risks here outweigh whatever yield you're chasing.", emoji: "🙀", colour: "text-red-700 bg-red-50", short: "Stay away" };
}

export default function PersonalMock() {
  return (
    <div className={`min-h-screen ${BG}`}>
      <StickyBar />
      <main className="mx-auto max-w-6xl px-6 pt-6 pb-20">
        <Header />
        <SearchBar />
        <CatDadVerdict />
        <StatGrid />
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <VulnerabilityAssessment />
            <ContractAnalysis />
          </div>
          <div className="space-y-6">
            <AssetAnalysis />
            <PositionRisks />
          </div>
        </div>
        <Footer />
      </main>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between pb-4">
      <Link href="/mock" className="flex items-center gap-3">
        <div className="relative">
          <Image src="/cat-dad.png" alt="" width={52} height={52} className="rounded-xl ring-2 ring-white" />
        </div>
        <div>
          <div className={`text-xl font-bold leading-none ${INK}`}>Iceberg 🧊</div>
          <div className={`mt-0.5 text-xs ${MUTED}`}>The risk beneath your yield · by Cat Dad</div>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <a
          href="https://x.com/CatDad0x"
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium hover:shadow-sm"
          style={{ color: SECONDARY }}
        >
          @CatDad0x ↗
        </a>
      </div>
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
      <button className="rounded-xl px-5 py-2 text-sm font-medium text-white transition hover:opacity-90" style={{ background: PRIMARY }}>
        Analyze
      </button>
    </div>
  );
}

function CatDadVerdict() {
  const v = verdict(MOCK.riskScore);
  return (
    <div
      className="mt-4 flex items-center gap-4 rounded-2xl border-2 p-4"
      style={{ borderColor: ACCENT, background: "#fff" }}
    >
      <Image src="/cat-dad.png" alt="" width={56} height={56} className="shrink-0 rounded-xl" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs uppercase tracking-wide ${MUTED}`}>Cat Dad says</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${v.colour}`}>
            {v.emoji} {v.short}
          </span>
        </div>
        <div className={`mt-1 text-sm ${INK}`}>&ldquo;{v.text}&rdquo;</div>
      </div>
    </div>
  );
}

function StickyBar() {
  const v = verdict(MOCK.riskScore);
  return (
    <div className="sticky top-0 z-40 border-b-2 border-[#E8DCC4] bg-[#F8F1E2]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2.5 text-sm">
        <div className="flex items-center gap-3">
          <ScoreRing score={MOCK.riskScore} size={36} />
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.colour}`}>
              {v.emoji} {v.short}
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

function StatGrid() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card>
        <div className={`text-xs uppercase tracking-wide ${MUTED}`}>Risk Score</div>
        <div className="mt-3 flex items-center gap-3">
          <ScoreRing score={MOCK.riskScore} size={64} />
          <div className={`text-xs ${MUTED} leading-relaxed`}>
            0 critical<br />3 caveats<br />9 ok
          </div>
        </div>
      </Card>
      <Card>
        <Label icon="🏛">Protocol</Label>
        <div className={`mt-3 text-base font-semibold ${INK}`}>Aerodrome SlipStream</div>
        <div className={`text-xs ${MUTED}`}>Concentrated liquidity (CL)</div>
      </Card>
      <Card>
        <Label icon="💧">Pool</Label>
        <div className={`mt-3 text-base font-semibold ${INK}`}>{MOCK.pair}</div>
        <div className={`text-xs ${MUTED}`}>{MOCK.feePercent}% fee tier</div>
      </Card>
      <Card>
        <Label icon="🔵">Chain</Label>
        <div className={`mt-3 text-base font-semibold ${INK}`}>Base</div>
        <a href={MOCK.explorerTxUrl} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: SECONDARY }}>
          View transaction ↗
        </a>
      </Card>
    </div>
  );
}

function VulnerabilityAssessment() {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className={`text-base font-semibold ${INK}`}>Vulnerability Assessment</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {MOCK.checks.length} checks
          </span>
        </div>
        <div className={`text-[11px] ${MUTED}`}>Tap a row to learn more</div>
      </div>
      <div className="mt-4 space-y-2">
        {CATEGORY_ORDER.map((cat) => {
          const checks = MOCK.checks.filter((c) => c.category === cat);
          if (checks.length === 0) return null;
          return <CategoryGroup key={cat} category={cat} checks={checks} />;
        })}
      </div>
    </Card>
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
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#FDF8EC]"
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${pillIconColour(check.severity)}`}>
          {SEVERITY_ICON[check.severity]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-medium ${INK}`}>{check.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_PILL[check.severity]}`}>
              {SEVERITY_LABEL[check.severity]}
            </span>
          </div>
          <div className={`mt-0.5 text-xs ${MUTED} truncate`}>{check.oneLine}</div>
        </div>
        <span className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="ml-9 rounded-lg bg-[#F8F1E2] p-3 text-xs leading-relaxed text-slate-700">
            {check.info}
          </div>
          {check.learnMoreUrl && (
            <a
              href={check.learnMoreUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-9 mt-2 inline-block text-xs hover:underline"
              style={{ color: SECONDARY }}
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

function ContractAnalysis() {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <span>🔒</span>
        <h2 className={`text-base font-semibold ${INK}`}>Contract Analysis</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">1 item</span>
      </div>
      <div className="mt-3 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-sm font-medium ${INK}`}>Aerodrome SlipStream (CL) pool</div>
            <a
              href="https://basescan.org/address/0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] hover:underline"
              style={{ color: SECONDARY }}
            >
              0xb2cc22…59dc59 ↗
            </a>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">VERIFIED</span>
        </div>
      </div>
    </Card>
  );
}

function AssetAnalysis() {
  return (
    <Card>
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
              style={{ color: SECONDARY }}
            >
              {a.address.slice(0, 6)}…{a.address.slice(-4)} · Basescan ↗
            </a>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PositionRisks() {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <span>⚡</span>
        <h2 className={`text-base font-semibold ${INK}`}>Compounding Risks</h2>
      </div>
      <ol className={`mt-3 space-y-2 text-xs leading-relaxed ${MUTED}`}>
        <li>1. Active management required. out-of-range = no fees + IL realised on rebalance.</li>
        <li>2. Centralised stablecoin exposure. Circle blacklist applies to USDC half.</li>
        <li>3. Frontend phishing risk. bookmark aerodrome.finance, two prior DNS hijacks.</li>
      </ol>
    </Card>
  );
}

function Footer() {
  return (
    <div className={`mt-12 border-t-2 border-[#E8DCC4] pt-6`}>
      <div className="flex items-start gap-3">
        <Image src="/cat-dad.png" alt="" width={40} height={40} className="rounded-lg" />
        <div className={`flex-1 text-xs leading-relaxed ${MUTED}`}>
          <div className={`font-semibold ${INK}`}>Built by Cat Dad</div>
          <div className="mt-0.5">
            Frameworks borrowed from a past life in asset management. Not financial advice. verify all findings independently.
          </div>
          <a href="https://x.com/CatDad0x" target="_blank" rel="noreferrer" className="mt-1 inline-block hover:underline" style={{ color: SECONDARY }}>
            @CatDad0x ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className={`rounded-2xl ${SURFACE} p-5 shadow-sm`}>{children}</div>;
}

function Label({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F8F1E2] text-sm">{icon}</span>
      <span className={`text-xs uppercase tracking-wide ${MUTED}`}>{children}</span>
    </div>
  );
}

function ScoreRing({ score, size }: { score: number; size: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const colour = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" className="font-bold" fontSize={size / 3} fill={colour}>
        {score}
      </text>
    </svg>
  );
}
