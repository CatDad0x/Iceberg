"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import ThemeToggle from "../components/ThemeToggle";
import { saveRecentSearch } from "../page";

// ─── Types ───────────────────────────────────────────────────────────────────

type RiskLevel = "critical" | "high" | "medium" | "low" | "info";
type TrustLevel = "trusted" | "caution" | "danger";

type Finding = { title: string; detail: string; level: RiskLevel };

type ContractFunctions = { trading: string[]; poolSetup: string[]; admin: string[]; read: string[] };

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

type AssetRisk = {
  address: string;
  symbol: string;
  name: string;
  assetType: string;
  trustLevel: TrustLevel;
  riskNotes: string[];
  priceUsd?: number;
};

type YIFFCategory =
  | "Protocol Security"
  | "Pool Security"
  | "Governance & Control"
  | "Position Economics";

type VulnerabilityCheck = {
  category: YIFFCategory;
  title: string;
  severity: RiskLevel;
  finding: string;
  info: string;
  laymanTerms?: string;
  learnMoreUrl?: string;
};

type FlowStepStatus = "done" | "current" | "missing" | "optional" | "recurring";
type FlowStep = { step: number; title: string; icon: string; status: FlowStepStatus; detail: string };

type PositionOverview = {
  protocol: string;
  pair?: string;
  feePercent?: number;
  positionType: string;
  chain: string;
  explorerTxUrl: string;
  nftPriceRange?: { lower: number; upper: number; token0Symbol?: string; token1Symbol?: string };
};

type ScenarioImpact = "high" | "medium" | "low";
type Scenario = { title: string; description: string; impact: ScenarioImpact; icon: string };

type Audit = {
  auditor: string;
  date: string;
  highestSeverity: "critical" | "high" | "medium" | "low" | "none";
  notes: string;
  url?: string;
};

type Exploit = {
  date: string;
  amountUsd?: number;
  title: string;
  description: string;
  url?: string;
};

type GovernanceProposal = {
  id: string;
  title: string;
  endsAt: number;
  url: string;
};

type AnalysisResult = {
  txHash: string;
  chain: string;
  summary: string;
  overallRisk: RiskLevel;
  riskScore: number;
  positionOverview: PositionOverview;
  contracts: ContractRisk[];
  assets: AssetRisk[];
  stackedRisks: string[];
  aiNarrative: string;
  sources: { title: string; url: string }[];
  vulnerabilityChecks: VulnerabilityCheck[];
  scenariosThatCanGoWrong: Scenario[];
  howToProtectYourself: string[];
  audits: Audit[];
  exploits?: Exploit[];
  activeProposals?: GovernanceProposal[];
  protocolFlow: { name: string; steps: FlowStep[]; callout: string } | null;
  protocolDocs: { docs: string; app: string } | null;
};

// ─── PDF export ──────────────────────────────────────────────────────────────

async function downloadReport(result: AnalysisResult) {
  const { pdf } = await import("@react-pdf/renderer");
  const { RiskReportPDF } = await import("../components/RiskReportPDF");
  const logoUrl = `${window.location.origin}/Logo.png`;

  const blob = await pdf(<RiskReportPDF result={result} logoUrl={logoUrl} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const pair = result.positionOverview.pair?.replace(" / ", "-") ?? "Unknown";
  const protocol = result.positionOverview.protocol.replace(/\s+/g, "-");
  const date = new Date().toISOString().split("T")[0];
  a.download = `Iceberg-Risk-Report-${protocol}-${pair}-${date}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BG = "bg-[#F4F7FA]";
const SURFACE = "bg-white";
const PRIMARY = "#C8302B";
const ICE_DARK = "#1E4E6E";
const INK = "text-[#1B1B2F]";
const MUTED = "text-[#5B6B7E]";

const CATEGORY_ORDER: YIFFCategory[] = [
  "Protocol Security",
  "Pool Security",
  "Governance & Control",
  "Position Economics",
];

const CATEGORY_ICON: Record<YIFFCategory, string> = {
  "Protocol Security": "🛠",
  "Pool Security": "💧",
  "Governance & Control": "🏛",
  "Position Economics": "📊",
};

const SEVERITY_DOT: Record<RiskLevel, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-400",
  low: "bg-emerald-500",
  info: "bg-slate-300",
};

const SEVERITY_PILL: Record<RiskLevel, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-emerald-100 text-emerald-700",
  info: "bg-slate-100 text-slate-600",
};

const SEVERITY_LABEL: Record<RiskLevel, string> = {
  critical: "CRITICAL CONCERN",
  high: "HIGH CONCERN",
  medium: "MEDIUM CONCERN",
  low: "LOW CONCERN",
  info: "INFO",
};

const SEVERITY_ICON: Record<RiskLevel, string> = {
  critical: "✗",
  high: "✗",
  medium: "!",
  low: "✓",
  info: "ⓘ",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Concentrated-liquidity IL calculator.
// For a position with range [Pa, Pb] and reference entry price P0,
// returns the IL % at each boundary vs simply holding the same tokens.
// Formula: derived from Uniswap v3 LP value equations (Atis Elsts, 2021).
function calcCLIL(Pa: number, Pb: number, P0: number): { ilAtLower: number; ilAtUpper: number } | null {
  if (Pa <= 0 || Pb <= 0 || P0 <= 0 || Pa >= Pb) return null;
  const sqPa = Math.sqrt(Pa);
  const sqPb = Math.sqrt(Pb);
  const sqP0 = Math.sqrt(P0);

  // Pool value per unit L at each price (in token1 units)
  const V_lower = sqPa - Pa / sqPb;
  const V_upper = sqPb - sqPa;

  // Hold value (same initial composition) at each boundary
  const H_lower = Pa / sqP0 - Pa / sqPb + sqP0 - sqPa;
  const H_upper = Pb / sqP0 - sqPb + sqP0 - sqPa;

  if (H_lower <= 0 || H_upper <= 0) return null;

  return {
    ilAtLower: (V_lower / H_lower - 1) * 100,
    ilAtUpper: (V_upper / H_upper - 1) * 100,
  };
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })}B`;
  if (n >= 1e6) return `$${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatAge(ts: number): { label: string; riskColour: string } {
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  let label: string;
  if (days < 1)        label = "deployed today";
  else if (days < 7)   label = `${days} day${days === 1 ? "" : "s"} old`;
  else if (days < 30)  label = `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? "" : "s"} old`;
  else if (days < 365) label = `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"} old`;
  else                 label = `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? "" : "s"} old`;

  // Risk colour: new pools carry more uncertainty
  const riskColour =
    days < 30  ? "text-red-600 bg-red-50"     :   // < 1 month — very new
    days < 90  ? "text-orange-600 bg-orange-50" :  // < 3 months — new
    days < 180 ? "text-yellow-700 bg-yellow-50" :  // < 6 months — moderate
                 "text-emerald-700 bg-emerald-50";  // 6 months+ — established

  return { label, riskColour };
}

function explorerAddrUrl(chain: string, address: string): string {
  return chain === "base" ? `https://basescan.org/address/${address}` : `https://etherscan.io/address/${address}`;
}

function verdict(score: number) {
  if (score >= 90) return { text: "Excellent", emoji: "", colour: "text-emerald-700 bg-emerald-50" };
  if (score >= 80) return { text: "Very Good", emoji: "", colour: "text-emerald-600 bg-emerald-50" };
  if (score >= 70) return { text: "Good", emoji: "", colour: "text-teal-700 bg-teal-50" };
  if (score >= 60) return { text: "Fair", emoji: "", colour: "text-yellow-700 bg-yellow-50" };
  if (score >= 50) return { text: "Borderline", emoji: "", colour: "text-orange-600 bg-orange-50" };
  if (score >= 30) return { text: "Risky", emoji: "", colour: "text-orange-700 bg-orange-100" };
  if (score >= 20) return { text: "Very Risky", emoji: "", colour: "text-red-600 bg-red-50" };
  return { text: "Critical", emoji: "", colour: "text-red-700 bg-red-100" };
}

function pillIconColour(level: RiskLevel): string {
  if (level === "critical" || level === "high") return "text-red-600 bg-red-50";
  if (level === "medium") return "text-orange-600 bg-orange-50";
  if (level === "low") return "text-emerald-600 bg-emerald-50";
  return "text-slate-500 bg-slate-100";
}

function chainIcon(chain: string): string {
  return chain === "base" ? "🔵" : "💎";
}

function countByLevel(checks: VulnerabilityCheck[]) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const c of checks) counts[c.severity]++;
  const ok = counts.low + counts.info;
  const caveats = counts.medium + counts.high;
  return { ok, caveats, critical: counts.critical };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RiskToolPage() {
  const [txHash, setTxHash] = useState("");
  const [chain, setChain] = useState<"ethereum" | "base">("base");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Pre-fill and auto-run when arriving via URL params (shareable links + "See a sample" link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // support both ?input= (new) and ?tx= (old links)
    const tx = params.get("input") ?? params.get("tx");
    const c = params.get("chain");
    const resolvedChain = c === "ethereum" || c === "base" ? c : "base";
    if (!tx) return;
    setTxHash(tx);
    setChain(resolvedChain);

    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);
    fetch("/api/risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: tx.trim(), chain: resolvedChain }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data.error ?? "Analysis failed");
        setResult(data);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  async function analyze() {
    if (!txHash.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: txHash.trim(), chain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data);
      saveRecentSearch(txHash.trim(), chain);
      // Push shareable URL so the user can copy it from the address bar
      const params = new URLSearchParams({ input: txHash.trim(), chain });
      window.history.pushState({}, "", `?${params.toString()}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`min-h-screen ${BG}`}>
      <div className="no-print">{result && <StickyBar result={result} />}</div>
      <main className="mx-auto max-w-6xl px-6 pt-6 pb-20">
        <div className="no-print"><Header /></div>
        <div className="no-print">
          <SearchBar
            chain={chain}
            setChain={setChain}
            txHash={txHash}
            setTxHash={setTxHash}
            analyze={analyze}
            loading={loading}
          />

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && <LoadingState />}

          {!result && !loading && !error && <EmptyState onTry={(h) => setTxHash(h)} />}
        </div>

        {result && !loading && (
          <>
            {result.activeProposals && result.activeProposals.length > 0 && (
              <ActiveProposalsBanner proposals={result.activeProposals} protocol={result.positionOverview.protocol} />
            )}
            <HeroRow result={result} />
            {result.protocolFlow && <PositionMap flow={result.protocolFlow} />}
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <VulnerabilityAssessment key={result.txHash} checks={result.vulnerabilityChecks} narrative={result.aiNarrative} />
                <ContractAnalysis contracts={result.contracts} chain={result.chain} />
                {result.audits?.length > 0 && <AuditList audits={result.audits} />}
                {result.exploits && result.exploits.length > 0 && <ExploitTimeline exploits={result.exploits} />}
                {result.sources.length > 0 && <Sources sources={result.sources} />}
              </div>
              <div className="space-y-4">
                {result.scenariosThatCanGoWrong.length > 0 && (
                  <WhatCanGoWrongSidebar scenarios={result.scenariosThatCanGoWrong} />
                )}
                {result.howToProtectYourself.length > 0 && (
                  <HowToProtectYourselfSidebar items={result.howToProtectYourself} />
                )}
                <AssetAnalysis assets={result.assets} chain={result.chain} />
                <DownloadReportButton result={result} />
              </div>
            </div>
          </>
        )}

        <Footer />
      </main>
    </div>
  );
}

// ─── Layout components ───────────────────────────────────────────────────────

function Header() {
  return (
    <div className="flex items-center justify-between pb-4">
      <Link href="/" className="flex items-center gap-3">
        <Image src="/Logo.png" alt="Iceberg" width={36} height={36} className="rounded-lg" />
        <div>
          <div className={`text-xl font-bold leading-none ${INK}`}>Iceberg</div>
          <div className={`mt-0.5 text-xs ${MUTED} hidden sm:block`}>The risk beneath your yield</div>
        </div>
      </Link>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <a
          href="https://x.com/CatDad0x"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <Image src="/cat-dad.png" alt="CatDad0x" width={26} height={26} className="rounded-full" />
          <span className="hidden sm:inline">Built by @CatDad0x</span>
        </a>
      </div>
    </div>
  );
}

function SearchBar({
  chain,
  setChain,
  txHash,
  setTxHash,
  analyze,
  loading,
}: {
  chain: "ethereum" | "base";
  setChain: (c: "ethereum" | "base") => void;
  txHash: string;
  setTxHash: (h: string) => void;
  analyze: () => void;
  loading: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-2xl ${SURFACE} p-3 shadow-sm`}>
      <select
        value={chain}
        onChange={(e) => setChain(e.target.value as "ethereum" | "base")}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        <option value="base">🔵 Base</option>
        <option value="ethereum">💎 Ethereum</option>
      </select>
      <input
        value={txHash}
        onChange={(e) => setTxHash(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && analyze()}
        placeholder="Paste a tx hash or pool / gauge address (0x...)"
        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 placeholder:text-slate-400"
      />
      <button
        onClick={analyze}
        disabled={loading || !txHash.trim()}
        className="shrink-0 rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40"
      >
        {loading ? "Analyzing…" : "Analyze"}
      </button>
    </div>
  );
}

function ActiveProposalsBanner({ proposals, protocol }: { proposals: GovernanceProposal[]; protocol: string }) {
  function timeLeft(endsAt: number): string {
    const secs = endsAt - Date.now() / 1000;
    if (secs < 3600)  return `${Math.round(secs / 60)}m left`;
    if (secs < 86400) return `${Math.round(secs / 3600)}h left`;
    return `${Math.round(secs / 86400)}d left`;
  }
  return (
    <div className="mt-4 rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-xl">⚡</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-yellow-900">
            {proposals.length} active governance vote{proposals.length > 1 ? "s" : ""} on {protocol}
          </p>
          <p className="mt-0.5 text-xs text-yellow-800">
            An open vote could change how this protocol works — fees, emissions, or contract upgrades. Check before committing funds.
          </p>
          <div className="mt-2 space-y-1.5">
            {proposals.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg bg-yellow-100 px-3 py-1.5 hover:bg-yellow-200 transition-colors"
              >
                <span className="text-xs font-medium text-yellow-900 truncate">{p.title}</span>
                <span className="shrink-0 text-[11px] text-yellow-700 font-semibold">{timeLeft(p.endsAt)} ↗</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Share
        </>
      )}
    </button>
  );
}

function StickyBar({ result }: { result: AnalysisResult }) {
  const v = verdict(result.riskScore);
  const counts = countByLevel(result.vulnerabilityChecks);
  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-[#F4F7FA]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 sm:px-6 py-2.5 text-sm">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <IcebergSVG score={result.riskScore} size={36} compact />
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className={`font-semibold ${INK}`}>{result.riskScore}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.colour}`}>
              {v.text}
            </span>
            <span className={`${MUTED} text-xs truncate hidden sm:inline`}>
              {result.positionOverview.protocol}
              {result.positionOverview.pair ? ` · ${result.positionOverview.pair}` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className={`hidden sm:flex items-center gap-3 text-xs ${MUTED}`}>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {counts.ok} ok
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-yellow-400" /> {counts.caveats} caveats
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {counts.critical} critical
            </span>
          </div>
          {/* Mobile: condensed dot summary */}
          <div className={`flex sm:hidden items-center gap-1.5 text-xs ${MUTED}`}>
            <span className="flex items-center gap-0.5"><span className="h-2 w-2 rounded-full bg-red-500" />{counts.critical}</span>
            <span className="flex items-center gap-0.5"><span className="h-2 w-2 rounded-full bg-yellow-400" />{counts.caveats}</span>
            <span className="flex items-center gap-0.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{counts.ok}</span>
          </div>
          <CopyLinkButton />
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className={`mt-4 ${SURFACE} rounded-2xl p-12 text-center shadow-sm`}>
      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#C8302B]" />
      <p className={`text-sm font-medium ${INK}`}>Researching the transaction…</p>
      <p className={`mt-1 text-xs ${MUTED}`}>Decoding contracts, reading on-chain state, searching the web. This can take 30 to 60 seconds.</p>
    </div>
  );
}

function EmptyState({ onTry }: { onTry: (hash: string) => void }) {
  const example = "0x19e9fe153c5cdebaea8816ed4ff766f1aa47bb552bd97adc68ec1544bd656adb";
  return (
    <div className={`mt-4 ${SURFACE} rounded-2xl p-12 text-center shadow-sm`}>
      <div className="mx-auto mb-4">
        <Image src="/Logo.png" alt="" width={80} height={80} className="mx-auto mix-blend-multiply" />
      </div>
      <p className={`text-sm font-medium ${INK}`}>Paste a transaction hash to get a risk breakdown.</p>
      <p className={`mt-3 text-xs ${MUTED}`}>
        Try the Aerodrome LP example:{" "}
        <button
          onClick={() => onTry(example)}
          className="font-mono underline hover:text-slate-900"
        >
          {example.slice(0, 10)}…{example.slice(-8)}
        </button>
      </p>
    </div>
  );
}

// ─── Hero row ────────────────────────────────────────────────────────────────

function HeroRow({ result }: { result: AnalysisResult }) {
  const v = verdict(result.riskScore);
  const counts = countByLevel(result.vulnerabilityChecks);
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
      {/* Iceberg score card */}
      <div className={`${SURFACE} rounded-2xl p-5 shadow-sm flex flex-col`}>
        <div className={`text-xs uppercase tracking-wide ${MUTED}`}>Iceberg Score</div>
        <div className="mt-3 flex items-center gap-4">
          <IcebergSVG score={result.riskScore} size={72} />
          <div>
            <div className={`text-4xl font-bold leading-none ${INK}`}>
              {result.riskScore}
              <span className={`text-lg font-normal ${MUTED}`}>/100</span>
            </div>
            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.colour}`}>
              {v.text}
            </span>
          </div>
        </div>
        <div className="mt-auto flex h-[64px] items-center justify-between border-t border-slate-100">
          <div className="text-center">
            <div className={`text-lg font-bold ${counts.critical > 0 ? "text-red-600" : INK}`}>{counts.critical}</div>
            <div className={`text-[10px] ${MUTED}`}>critical</div>
          </div>
          <div className={`h-6 w-px bg-slate-100`} />
          <div className="text-center">
            <div className={`text-lg font-bold ${counts.caveats > 0 ? "text-yellow-600" : INK}`}>{counts.caveats}</div>
            <div className={`text-[10px] ${MUTED}`}>flags</div>
          </div>
          <div className={`h-6 w-px bg-slate-100`} />
          <div className="text-center">
            <div className={`text-lg font-bold text-emerald-600`}>{counts.ok}</div>
            <div className={`text-[10px] ${MUTED}`}>clear</div>
          </div>
        </div>
      </div>

      <ProtocolCard result={result} />
      <PoolCard result={result} />
      <ChainCard result={result} />
    </div>
  );
}

function ProtocolCard({ result }: { result: AnalysisResult }) {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm flex flex-col`}>
      <Label icon="🏛">Protocol</Label>
      <div className={`mt-3 text-base font-semibold ${INK}`}>{result.positionOverview.protocol}</div>
      <div className="mt-auto flex h-[64px] items-center border-t border-slate-100">
        {result.protocolDocs ? (
          <div className="flex flex-wrap gap-1.5">
            <DocChip href={result.protocolDocs.docs}>Docs</DocChip>
            <DocChip href={result.protocolDocs.app}>App</DocChip>
          </div>
        ) : (
          <span className={`text-[11px] ${MUTED}`}>{result.positionOverview.positionType}</span>
        )}
      </div>
    </div>
  );
}

function PoolCard({ result }: { result: AnalysisResult }) {
  const poolContract = result.contracts.find((c) => c.poolType);
  const tvl = poolContract?.poolReserves?.tvlUsd;
  const age = poolContract?.deployedAt ? formatAge(poolContract.deployedAt) : null;
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm flex flex-col`}>
      <Label icon="💧">Pool</Label>
      <div className={`mt-3 text-base font-semibold ${INK}`}>{result.positionOverview.pair ?? "Unknown"}</div>
      <div className={`text-xs ${MUTED}`}>
        {result.positionOverview.feePercent !== undefined ? `${result.positionOverview.feePercent}% fee tier` : "Fee unknown"}
      </div>
      {(tvl !== undefined || age) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tvl !== undefined && (
            <>
              <span className={`text-xs font-semibold ${INK}`}>{fmtUsd(tvl)}</span>
              <span className={`text-xs ${MUTED}`}>TVL</span>
              {tvl < 100_000 && (
                <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">Low liquidity</span>
              )}
              {tvl >= 10_000_000 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Deep liquidity</span>
              )}
            </>
          )}
          {age && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${age.riskColour}`}>
              {age.label}
            </span>
          )}
        </div>
      )}
      <div className="mt-auto flex h-[64px] items-center border-t border-slate-100">
        {poolContract ? (
          <a
            href={explorerAddrUrl(result.chain, poolContract.address)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] hover:underline"
            style={{ color: ICE_DARK }}
          >
            {poolContract.address.slice(0, 8)}…{poolContract.address.slice(-6)} ↗
          </a>
        ) : (
          <span className={`text-[11px] ${MUTED}`}>Pool address unknown</span>
        )}
      </div>
    </div>
  );
}

function ChainCard({ result }: { result: AnalysisResult }) {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm flex flex-col`}>
      <Label icon={chainIcon(result.chain)}>Chain</Label>
      <div className={`mt-3 text-base font-semibold ${INK}`}>
        {result.chain.charAt(0).toUpperCase() + result.chain.slice(1)}
      </div>
      <div className={`text-xs ${MUTED}`}>
        {result.chain === "base" ? "Coinbase L2 Optimistic Rollup" : "Layer 1"}
      </div>
      <div className="mt-auto flex h-[64px] items-center border-t border-slate-100">
        <a
          href={result.positionOverview.explorerTxUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] hover:underline"
          style={{ color: ICE_DARK }}
        >
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

// ─── Position Map ────────────────────────────────────────────────────────────

function PositionMap({ flow }: { flow: { name: string; steps: FlowStep[]; callout: string } }) {
  const missingCount = flow.steps.filter((s) => s.status === "missing").length;
  const stepCount = flow.steps.length;

  return (
    <div className={`mt-6 ${SURFACE} rounded-2xl p-5 shadow-sm relative overflow-hidden`}>
      {/* Subtle wavy ice background at the bottom */}
      <svg
        className="pointer-events-none absolute bottom-0 left-0 right-0 w-full opacity-[0.18]"
        viewBox="0 0 800 80"
        preserveAspectRatio="none"
        height="60"
      >
        <path
          d="M0,40 Q100,10 200,30 T400,30 T600,30 T800,30 L800,80 L0,80 Z"
          fill="#A8D5E2"
        />
        <path
          d="M0,55 Q120,30 240,45 T480,45 T720,45 T800,45 L800,80 L0,80 Z"
          fill="#6FAACE"
          opacity="0.5"
        />
      </svg>

      <div className="relative flex items-center justify-between">
        <div>
          <h2 className={`text-base font-semibold ${INK}`}>Position Map</h2>
          <p className={`text-xs ${MUTED}`}>{flow.name}</p>
        </div>
        {missingCount > 0 && (
          <div className="rounded-full bg-yellow-50 px-3 py-1 text-[11px] font-semibold text-yellow-800">
            {missingCount} step{missingCount === 1 ? "" : "s"} missing
          </div>
        )}
      </div>

      {/* Journey row with arrows between steps */}
      <div className="relative mt-8 flex items-start">
        {flow.steps.map((s, i) => (
          <div key={s.step} className="flex flex-1 items-start">
            <JourneyStep step={s} />
            {i < flow.steps.length - 1 && <JourneyArrow />}
          </div>
        ))}
      </div>

      {missingCount > 0 && (
        <div className="relative mt-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="shrink-0">
            <MiniIcebergGlyph />
          </div>
          <div className="text-xs leading-relaxed text-slate-700">{flow.callout}</div>
        </div>
      )}
    </div>
  );
}

function JourneyArrow() {
  // label container is h-6 (24px), circles are h-14 (56px).
  // Circle centre = 24 + 28 = 52px from top of the step column.
  // Arrow svg line sits at y-centre of its own h-5 (20px) container → 10px within it.
  // So mt must be 52 - 10 = 42px ≈ mt-[42px].
  return (
    <div className="mx-0.5 mt-[42px] flex h-5 flex-1 items-center justify-center">
      <svg width="100%" height="20" viewBox="0 0 60 20" preserveAspectRatio="none" className="text-slate-300">
        <line x1="0" y1="10" x2="52" y2="10" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
        <polygon points="60,10 50,5 50,15" fill="currentColor" />
      </svg>
    </div>
  );
}

function MiniIcebergGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      <polygon points="10,22 16,8 22,18 28,5 34,22" fill="white" stroke="#2D4F88" strokeWidth="1.6" strokeLinejoin="miter" />
      <line x1="2" y1="22" x2="38" y2="22" stroke="#6FAACE" strokeWidth="1.4" />
      <polygon points="10,24 30,24 20,38" fill="#DCEAF5" stroke="#6FAACE" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.85" />
    </svg>
  );
}

function StepIcon({ status, stepNum }: { status: FlowStepStatus; stepNum: number }) {
  if (status === "done") {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === "recurring") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15" />
      </svg>
    );
  }
  return <span className="text-base font-bold">{stepNum}</span>;
}

function JourneyStep({ step }: { step: FlowStep }) {
  const config = stepConfig(step.status);
  const isCurrent = step.status === "current";

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      {/* Status label — fixed h-6 so arrow offset is predictable */}
      <div className="flex h-6 items-center justify-center">
        {isCurrent ? (
          <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
            You are here
          </span>
        ) : (
          <span className={`text-[10px] font-bold uppercase tracking-wider ${config.labelColour}`}>
            {config.label}
          </span>
        )}
      </div>

      {/* Circle — uniform h-14 w-14 for all steps */}
      <div className="relative mt-1">
        {isCurrent && (
          <div className="absolute inset-0 -m-2 animate-pulse rounded-full bg-blue-300 opacity-50" />
        )}
        <div
          className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full shadow-md
            ${config.bg} ${config.ring} ${config.text}
            ${isCurrent ? "scale-110 ring-offset-2" : ""}`}
        >
          <StepIcon status={step.status} stepNum={step.step} />
        </div>
      </div>

      <div className={`mt-3 text-xs font-bold leading-tight ${INK}`}>{step.title}</div>
      <div className={`mt-1 text-[10px] leading-tight ${MUTED} px-1`}>{step.detail}</div>
    </div>
  );
}

function stepConfig(status: FlowStepStatus): {
  bg: string;
  ring: string;
  text: string;
  label: string;
  labelColour: string;
} {
  if (status === "done")
    return { bg: "bg-gradient-to-br from-emerald-400 to-emerald-600", ring: "ring-2 ring-emerald-300", text: "text-white", label: "Done", labelColour: "text-emerald-700" };
  if (status === "current")
    return { bg: "bg-gradient-to-br from-blue-500 to-blue-700", ring: "ring-4 ring-blue-400", text: "text-white", label: "You are here", labelColour: "text-blue-700" };
  if (status === "missing")
    return { bg: "bg-gradient-to-br from-amber-400 to-amber-500", ring: "ring-2 ring-amber-200", text: "text-white", label: "Missing", labelColour: "text-amber-700" };
  if (status === "optional")
    return { bg: "bg-slate-100", ring: "ring-2 ring-slate-300", text: "text-slate-400", label: "Optional", labelColour: "text-slate-500" };
  return { bg: "bg-gradient-to-br from-purple-400 to-purple-600", ring: "ring-2 ring-purple-200", text: "text-white", label: "Recurring", labelColour: "text-purple-600" };
}

// ─── Vulnerability Assessment ────────────────────────────────────────────────

function VulnerabilityAssessment({
  checks,
  narrative,
}: {
  checks: VulnerabilityCheck[];
  narrative: string;
}) {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className={`text-base font-semibold ${INK}`}>Vulnerability Assessment</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {checks.length} {checks.length === 1 ? "check" : "checks"}
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

      {checks.length === 0 ? (
        <p className={`mt-4 text-sm ${MUTED}`}>{narrative || "No checks available."}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {CATEGORY_ORDER.map((cat) => {
            let inCat = checks.filter((c) => (c.category ?? "").trim() === cat);
            if (inCat.length === 0) return null;
            // Token Risk always first within Position Economics
            if (cat === "Position Economics") {
              inCat = [
                ...inCat.filter((c) => c.title?.toLowerCase().includes("token risk")),
                ...inCat.filter((c) => !c.title?.toLowerCase().includes("token risk")),
              ];
            }
            return <CategoryGroup key={cat} category={cat} checks={inCat} />;
          })}
          {/* Safety net: show any checks whose category didn't match any known group */}
          {(() => {
            const orphans = checks.filter((c) => !CATEGORY_ORDER.includes((c.category ?? "").trim() as YIFFCategory));
            if (orphans.length === 0) return null;
            return <CategoryGroup key="other" category={"Protocol Security" as YIFFCategory} checks={orphans} />;
          })()}
        </div>
      )}

      {narrative && checks.length > 0 && (
        <details className="mt-4 border-t border-slate-100 pt-3">
          <summary className={`cursor-pointer text-xs font-medium ${MUTED} hover:text-slate-900`}>
            Key Takeaways ▾
          </summary>
          <ul className="mt-3 space-y-1.5">
            {narrative
              .split(/(?<=[.!?])\s+/)
              .map((s) => s.trim().replace(/^(and|but|so|however|also),?\s+/i, ""))
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
              .filter((s) => s.length > 15)
              .map((sentence, i) => (
                <li key={i} className={`flex items-start gap-2 text-sm leading-snug ${INK}`}>
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                  <span>{sentence}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
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

function CategoryGroup({ category, checks }: { category: YIFFCategory; checks: VulnerabilityCheck[] }) {
  // Within Pool Security: "Withdrawal / Exit" is the least interesting check — push it to the bottom
  const sorted = category === "Pool Security"
    ? [
        ...checks.filter((c) => !c.title.toLowerCase().includes("withdrawal") && !c.title.toLowerCase().includes("exit")),
        ...checks.filter((c) =>  c.title.toLowerCase().includes("withdrawal") ||  c.title.toLowerCase().includes("exit")),
      ]
    : checks;

  return (
    <details className="rounded-xl border border-slate-200">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
        <div className="flex items-center gap-2">
          <span className="text-base">{CATEGORY_ICON[category]}</span>
          <span className={`text-sm font-semibold ${INK}`}>{category}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{sorted.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {sorted.map((c, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${SEVERITY_DOT[c.severity]}`} />
          ))}
        </div>
      </summary>
      <div className="border-t border-slate-100">
        {sorted.map((c, i) => (
          <CheckRow key={i} check={c} />
        ))}
      </div>
    </details>
  );
}

function CheckRow({ check }: { check: VulnerabilityCheck }) {
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
              {SEVERITY_LABEL[check.severity]}
            </span>
          </div>
          <div className={`mt-0.5 text-xs ${MUTED} truncate`}>{check.finding}</div>
        </div>
        <span className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="ml-9 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            {check.info}
          </div>
          {check.laymanTerms && (
            <div className="ml-9 mt-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs leading-relaxed text-slate-700">
              <span className="font-semibold text-[#1E4E6E]">Plain English: </span>
              {check.laymanTerms}
            </div>
          )}
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

// ─── Side cards ──────────────────────────────────────────────────────────────

function ContractAnalysis({ contracts, chain }: { contracts: ContractRisk[]; chain: string }) {
  if (contracts.length === 0) return null;
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center gap-2">
        <span>🔒</span>
        <h2 className={`text-base font-semibold ${INK}`}>Contract Analysis</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {contracts.length} {contracts.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {contracts.map((c, i) => (
          <ContractDetail key={i} contract={c} chain={chain} />
        ))}
      </div>
    </div>
  );
}

function FunctionList({ label, fns, colour, limit = 99 }: { label: string; fns: string[]; colour: string; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? fns : fns.slice(0, limit);
  return (
    <div>
      <div className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${colour}`}>{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((fn, i) => (
          <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{fn}()</code>
        ))}
        {!showAll && fns.length > limit && (
          <button
            onClick={() => setShowAll(true)}
            className={`text-[10px] hover:underline ${MUTED}`}
          >
            +{fns.length - limit} more
          </button>
        )}
      </div>
    </div>
  );
}

function ContractDetail({ contract, chain }: { contract: ContractRisk; chain: string }) {
  const [open, setOpen] = useState(false);
  const fns = contract.functions;
  const hasPoolSetup = fns && fns.poolSetup.length > 0;
  const hasAdminFns = fns && fns.admin.length > 0;
  const hasTradingFns = fns && fns.trading.length > 0;
  const hasReadFns = fns && fns.read.length > 0;

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium ${INK}`}>{contract.label}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
            <a
              href={explorerAddrUrl(chain, contract.address)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono hover:underline"
              style={{ color: ICE_DARK }}
            >
              {contract.address.slice(0, 8)}…{contract.address.slice(-6)} ↗
            </a>
            {contract.poolType && contract.poolType !== "unknown" && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{contract.poolType}</span>
            )}
            {contract.isProxy && (
              <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] text-yellow-700 font-medium">Proxy</span>
            )}
          </div>
        </div>
        <span className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">

          {/* Contract metadata: age + creator + verified */}
          {(contract.deployedAt || contract.isVerified !== undefined) && (
            <div className="px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              {contract.isVerified !== undefined && (
                <span className={contract.isVerified ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                  {contract.isVerified ? "✓ Verified" : "✗ Unverified"}
                </span>
              )}
              {contract.deployedAt && (() => {
                const age = formatAge(contract.deployedAt);
                return (
                  <span className={MUTED}>
                    Deployed: <span className={INK}>{age.label}</span>
                    {" "}({new Date(contract.deployedAt * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric" })})
                  </span>
                );
              })()}
              {contract.creatorAddress && (
                <span className={MUTED}>
                  Creator:{" "}
                  <a
                    href={explorerAddrUrl(chain, contract.creatorAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono hover:underline"
                    style={{ color: ICE_DARK }}
                  >
                    {contract.creatorAddress.slice(0, 8)}…{contract.creatorAddress.slice(-4)} ↗
                  </a>
                </span>
              )}
            </div>
          )}

          {/* Pool reserves */}
          {contract.poolReserves && (
            <div className="px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Pool reserves</div>
              <div className="flex gap-4 text-[11px]">
                <span>
                  <span className={MUTED}>{contract.poolReserves.token0Symbol}:</span>{" "}
                  <span className={`font-medium ${INK}`}>{contract.poolReserves.token0Amount}</span>
                </span>
                <span>
                  <span className={MUTED}>{contract.poolReserves.token1Symbol}:</span>{" "}
                  <span className={`font-medium ${INK}`}>{contract.poolReserves.token1Amount}</span>
                </span>
              </div>
            </div>
          )}

          {/* Proxy info */}
          {contract.isProxy && (
            <div className="px-3 py-3 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700">Proxy</div>
              {contract.implementation && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={MUTED}>Logic contract:</span>
                  <a href={explorerAddrUrl(chain, contract.implementation)} target="_blank" rel="noreferrer" className="font-mono hover:underline" style={{ color: ICE_DARK }}>
                    {contract.implementation.slice(0, 8)}…{contract.implementation.slice(-6)} ↗
                  </a>
                </div>
              )}
              {contract.proxyAdmin && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={MUTED}>Upgrade controller:</span>
                  <a href={explorerAddrUrl(chain, contract.proxyAdmin)} target="_blank" rel="noreferrer" className="font-mono hover:underline" style={{ color: ICE_DARK }}>
                    {contract.proxyAdmin.slice(0, 8)}…{contract.proxyAdmin.slice(-6)} ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Security findings */}
          {contract.findings.length > 0 && (
            <div className="px-3 py-2">
              {contract.findings.map((f, i) => (
                <div key={i} className="border-b border-slate-100 py-2 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${pillIconColour(f.level)}`}>
                      {SEVERITY_ICON[f.level]}
                    </span>
                    <div>
                      <div className={`text-xs font-medium ${INK}`}>{f.title}</div>
                      <div className={`mt-0.5 text-[11px] ${MUTED}`}>{f.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Functions */}
          {(hasAdminFns || hasPoolSetup || hasTradingFns || hasReadFns) && (
            <div className="px-3 py-3 space-y-3">
              {hasTradingFns && <FunctionList label="Trading" fns={fns!.trading} colour="text-blue-600" />}
              {hasPoolSetup && <FunctionList label="Pool setup" fns={fns!.poolSetup} colour="text-teal-700" />}
              {hasAdminFns && (
                <div>
                  <FunctionList label="Admin access" fns={fns!.admin} colour="text-orange-600" />
                  <p className={`mt-1.5 text-[10px] ${MUTED}`}>These functions can pause, kill, or upgrade the contract.</p>
                </div>
              )}
              {hasReadFns && <FunctionList label="Read-only" fns={fns!.read} colour="text-slate-500" limit={8} />}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function DownloadReportButton({ result }: { result: AnalysisResult }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      await downloadReport(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          Generating PDF…
        </>
      ) : (
        <>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2v10M6 8l4 4 4-4" />
            <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" />
          </svg>
          Download Report
        </>
      )}
    </button>
  );
}

function AssetAnalysis({ assets, chain }: { assets: AssetRisk[]; chain: string }) {
  if (assets.length === 0) return null;
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center gap-2">
        <span>💰</span>
        <h2 className={`text-base font-semibold ${INK}`}>Assets ({assets.length})</h2>
      </div>
      <div className="mt-3 space-y-3">
        {assets.map((a, i) => (
          <AssetRow key={i} asset={a} chain={chain} />
        ))}
      </div>
    </div>
  );
}

function AssetRow({ asset, chain }: { asset: AssetRisk; chain: string }) {
  const explorerName = chain === "ethereum" ? "Etherscan" : "Basescan";
  const trustGlyph =
    asset.trustLevel === "trusted" ? "✓" : asset.trustLevel === "caution" ? "!" : "✗";
  const trustColour =
    asset.trustLevel === "trusted"
      ? "text-emerald-600 bg-emerald-50"
      : asset.trustLevel === "caution"
      ? "text-orange-500 bg-orange-50"
      : "text-red-500 bg-red-50";
  const trustTag =
    asset.trustLevel === "trusted" ? "TRUSTED" : asset.trustLevel === "caution" ? "UNFAMILIAR" : "UNVERIFIED";
  const trustTagColour =
    asset.trustLevel === "trusted"
      ? "bg-emerald-50 text-emerald-700"
      : asset.trustLevel === "caution"
      ? "bg-orange-50 text-orange-700"
      : "bg-red-50 text-red-700";

  return (
    <div className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${trustColour}`}>
          {trustGlyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-semibold ${INK}`}>{asset.symbol}</span>
            {asset.priceUsd !== undefined && (
              <span className={`text-sm font-semibold ${MUTED}`}>
                {asset.priceUsd >= 1
                  ? `$${asset.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : `$${asset.priceUsd.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${trustTagColour}`}>{trustTag}</span>
          </div>
          <div className={`mt-0.5 text-xs ${MUTED}`}>{asset.name}</div>
          {asset.address && (
            <a
              href={explorerAddrUrl(chain, asset.address)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-mono text-[11px] hover:underline"
              style={{ color: ICE_DARK }}
            >
              {asset.address.slice(0, 6)}…{asset.address.slice(-4)} · {explorerName} ↗
            </a>
          )}
          {asset.riskNotes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {asset.riskNotes.map((n, i) => (
                <li key={i} className="flex gap-2 text-[11px] text-slate-600 leading-relaxed">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${asset.trustLevel === "trusted" ? "bg-yellow-400" : "bg-orange-500"}`} />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ScenarioItem({
  scenario,
  impactStyle,
}: {
  scenario: Scenario;
  impactStyle: (impact: ScenarioImpact) => { pill: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  const style = impactStyle(scenario.impact);
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-base shrink-0">{scenario.icon}</span>
        <span className={`flex-1 text-xs font-medium ${INK} leading-snug`}>{scenario.title}</span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${style.pill}`}>
          {style.label}
        </span>
      </button>
      {open && (
        <p className={`px-3 pb-3 text-xs leading-relaxed ${MUTED}`}>{scenario.description}</p>
      )}
    </div>
  );
}

function WhatCanGoWrongSidebar({ scenarios }: { scenarios: Scenario[] }) {
  const [open, setOpen] = useState(false);
  const impactStyle = (impact: ScenarioImpact) =>
    impact === "high"
      ? { pill: "bg-red-100 text-red-700", label: "High" }
      : impact === "medium"
      ? { pill: "bg-yellow-100 text-yellow-800", label: "Medium" }
      : { pill: "bg-emerald-100 text-emerald-700", label: "Low" };

  return (
    <div className={`${SURFACE} rounded-2xl shadow-sm overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span>⚠️</span>
          <span className={`text-sm font-semibold ${INK}`}>What can go wrong</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{scenarios.length}</span>
        </div>
        <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-2">
          {scenarios.map((s, i) => (
            <ScenarioItem key={i} scenario={s} impactStyle={impactStyle} />
          ))}
        </div>
      )}
    </div>
  );
}

function HowToProtectYourselfSidebar({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${SURFACE} rounded-2xl shadow-sm overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span>🛡️</span>
          <span className={`text-sm font-semibold ${INK}`}>How to protect yourself</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{items.length}</span>
        </div>
        <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <ul className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-2.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-600">
                ✓
              </span>
              <span className={`text-xs leading-relaxed ${INK}`}>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SEVERITY_AUDIT: Record<Audit["highestSeverity"], { label: string; colour: string }> = {
  critical: { label: "Critical found",  colour: "bg-red-100 text-red-700" },
  high:     { label: "High found",      colour: "bg-orange-100 text-orange-700" },
  medium:   { label: "Medium found",    colour: "bg-yellow-100 text-yellow-800" },
  low:      { label: "Low / info only", colour: "bg-blue-100 text-blue-700" },
  none:     { label: "No issues found", colour: "bg-emerald-100 text-emerald-700" },
};

function AuditList({ audits }: { audits: Audit[] }) {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center gap-2 mb-3">
        <span>🔍</span>
        <h2 className={`text-base font-semibold ${INK}`}>Audit Reports</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{audits.length}</span>
      </div>
      <div className="space-y-3">
        {audits.map((a, i) => {
          const sev = SEVERITY_AUDIT[a.highestSeverity] ?? SEVERITY_AUDIT.none;
          return (
            <div key={i} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-semibold ${INK}`}>{a.auditor}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sev.colour}`}>{sev.label}</span>
                  <span className={`text-xs ${MUTED}`}>{a.date}</span>
                </div>
                <p className={`mt-0.5 text-xs ${MUTED}`}>{a.notes}</p>
              </div>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium hover:bg-slate-50 transition-colors"
                  style={{ color: ICE_DARK }}
                >
                  Report ↗
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExploitTimeline({ exploits }: { exploits: Exploit[] }) {
  return (
    <div className={`${SURFACE} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center gap-2 mb-3">
        <span>💀</span>
        <h2 className={`text-base font-semibold ${INK}`}>Exploit History</h2>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          {exploits.length} incident{exploits.length !== 1 ? "s" : ""}
        </span>
      </div>
      <p className={`mb-3 text-xs ${MUTED}`}>
        Past exploits on this protocol — amounts are approximate at time of incident.
      </p>
      <div className="relative space-y-0">
        {exploits.map((e, i) => (
          <div key={i} className="flex gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center">
              <div className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-red-500 bg-white" />
              {i < exploits.length - 1 && (
                <div className="w-0.5 flex-1 bg-red-200 mt-0.5 mb-0" style={{ minHeight: "28px" }} />
              )}
            </div>
            {/* Content */}
            <div className="flex-1 pb-4 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold ${INK}`}>{e.title}</span>
                {e.amountUsd !== undefined && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    {fmtUsd(e.amountUsd)} lost
                  </span>
                )}
                <span className={`text-[10px] ${MUTED}`}>{e.date}</span>
              </div>
              <p className={`mt-0.5 text-xs leading-relaxed ${MUTED}`}>{e.description}</p>
              {e.url && (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] hover:underline"
                  style={{ color: "#1E4E6E" }}
                >
                  Read post-mortem ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sources({ sources }: { sources: { title: string; url: string }[] }) {
  return (
    <div className={`${SURFACE} rounded-2xl shadow-sm overflow-hidden`}>
      <details>
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-slate-50 select-none">
          <div className="flex items-center gap-2">
            <span>📚</span>
            <h2 className={`text-base font-semibold ${INK}`}>Sources</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{sources.length}</span>
          </div>
          <span className="text-slate-400">▾</span>
        </summary>
        <ol className="border-t border-slate-100 px-5 pb-4 pt-3 space-y-3">
          {sources.map((s, i) => {
            let domain = "";
            try { domain = new URL(s.url).hostname.replace("www.", ""); } catch { domain = s.url; }
            return (
              <li key={i} className="flex items-start gap-2.5">
                <span className={`mt-0.5 shrink-0 text-[10px] font-semibold ${MUTED}`}>{i + 1}.</span>
                <div className="min-w-0">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-xs font-medium leading-snug hover:underline`}
                    style={{ color: ICE_DARK }}
                  >
                    {s.title} ↗
                  </a>
                  <div className={`mt-0.5 text-[10px] ${MUTED}`}>{domain}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </details>
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

// ─── Iceberg SVG (placeholder; replace with designer asset later) ────────────

function IcebergSVG({ score, size }: { score: number; size: number; compact?: boolean }) {
  const src =
    score >= 90 ? "/score-90.png" :
    score >= 80 ? "/score-80.png" :
    score >= 70 ? "/score-70.png" :
    score >= 60 ? "/score-60.png" :
    score >= 50 ? "/score-50.png" :
    score >= 30 ? "/score-30.png" :
    score >= 20 ? "/score-20.png" :
    "/score-0.png";

  return (
    <Image
      src={src}
      alt={`Iceberg score ${score}`}
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  );
}
