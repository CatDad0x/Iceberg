"use client";

import Image from "next/image";
import { useState } from "react";
import {
  MOCK,
  CATEGORY_ORDER,
  CATEGORY_ICON,
  SEVERITY_DOT,
  type RiskLevel,
  type YIFFCategory,
  type VulnerabilityCheck,
} from "../mockData";

// ─── Dark palette ─────────────────────────────────────────────────────────────
const BG        = "#0D1B2A";   // deep navy base
const SURF      = "#132236";   // card surface
const SURF2     = "#1A2E47";   // elevated / hover
const BORDER    = "#1E3A5A";   // subtle borders
const ICE       = "#5BC0DE";   // ice blue accent
const ICE_DIM   = "#2A4F6E";   // dimmed ice for backgrounds
const TEXT      = "#E8EEF4";   // primary text
const MUTED     = "#7A95B0";   // secondary text
const MUTED2    = "#4A6480";   // very dim

// Severity on dark
const SEV: Record<RiskLevel, { dot: string; pill: string; text: string; icon: string }> = {
  critical: { dot: "bg-red-500",    pill: "bg-red-500/15 text-red-400",    text: "text-red-400",    icon: "✗" },
  high:     { dot: "bg-orange-500", pill: "bg-orange-500/15 text-orange-400", text: "text-orange-400", icon: "✗" },
  medium:   { dot: "bg-yellow-400", pill: "bg-yellow-400/15 text-yellow-300", text: "text-yellow-300", icon: "!" },
  low:      { dot: "bg-emerald-500",pill: "bg-emerald-500/15 text-emerald-400", text: "text-emerald-400", icon: "✓" },
  info:     { dot: "bg-slate-500",  pill: "bg-slate-500/15 text-slate-400",  text: "text-slate-400",  icon: "ⓘ" },
};

const FLOW = [
  { step: 1, icon: "💱", title: "Hold pair tokens",  status: "done",     detail: "WETH + USDC in your wallet" },
  { step: 2, icon: "➕", title: "Add liquidity",      status: "current",  detail: "This transaction. LP NFT minted." },
  { step: 3, icon: "🌾", title: "Stake in Gauge",     status: "missing",  detail: "Earns AERO token emissions (swap fees go to veAERO voters)" },
  { step: 4, icon: "🔒", title: "Lock as veAERO",     status: "optional", detail: "Earn weekly voting rewards by directing emissions to pools" },
  { step: 5, icon: "💰", title: "Claim rewards",      status: "recurring",detail: "Claim AERO emissions and swap fees whenever you like" },
];

const SCENARIOS = [
  { icon: "📉", title: "Price exits range",      impact: "high",   desc: "If ETH price moves outside your tick range, fees drop to zero and you hold 100% of the losing asset until you rebalance." },
  { icon: "🎣", title: "Frontend hijack",         impact: "medium", desc: "Aerodrome's website has been hijacked twice. A fake approval could drain your wallet — bookmark the real URL." },
  { icon: "📊", title: "AERO emissions cut",      impact: "medium", desc: "Weekly veAERO votes can redirect emissions away from this pool overnight. Your base fee APR continues; bonus yield can drop sharply." },
  { icon: "⛽", title: "Rebalancing costs",        impact: "low",    desc: "Every time you shift your range, you pay gas + potential MEV sandwich fees. On Base this is cheap, but it adds up." },
];

const PROTECT = [
  "Bookmark aerodrome.finance and only access it from that bookmark.",
  "Set a price alert so you know when WETH is approaching the edges of your range.",
  "Stake the LP NFT in the gauge — you're leaving AERO emissions on the table otherwise.",
  "Don't put more than 10–20% of your stack into a single concentrated LP.",
];

function verdict(score: number) {
  if (score >= 80) return { text: "Looks clean",   colour: `${ICE}` };
  if (score >= 60) return { text: "Read carefully", colour: "#EAB308" };
  if (score >= 40) return { text: "I wouldn't",    colour: "#F97316" };
  return             { text: "Stay away",          colour: "#EF4444" };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DarkMock() {
  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "system-ui, sans-serif" }}>
      <StickyBar />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px" }}>
        <Header />
        <SearchBar />
        <HeroRow />
        <PositionMap />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginTop: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <VulnerabilityAssessment />
            <ContractSummary />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Assets />
            <WhatCanGoWrong />
            <HowToProtect />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sticky bar ───────────────────────────────────────────────────────────────

function StickyBar() {
  const v = verdict(MOCK.riskScore);
  const checks = MOCK.checks as VulnerabilityCheck[];
  const critical = checks.filter(c => c.severity === "critical").length;
  const high     = checks.filter(c => c.severity === "high").length;
  const medium   = checks.filter(c => c.severity === "medium").length;
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: `${BG}ee`, borderBottom: `1px solid ${BORDER}`, backdropFilter: "blur(12px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: ICE, fontVariantNumeric: "tabular-nums" }}>{MOCK.riskScore}</span>
          <span style={{ fontSize: 11, color: MUTED }}>/ 100</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: v.colour }}>{v.text}</span>
          <span style={{ width: 1, height: 16, background: BORDER, margin: "0 4px" }} />
          <span style={{ fontSize: 12, color: MUTED }}>{MOCK.protocol} · {MOCK.pair}</span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
          {critical > 0 && <span style={{ color: "#EF4444" }}>✗ {critical} critical</span>}
          {high     > 0 && <span style={{ color: "#F97316" }}>✗ {high} high</span>}
          {medium   > 0 && <span style={{ color: "#EAB308" }}>! {medium} medium</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Image src="/Logo.png" alt="Iceberg" width={36} height={36} style={{ borderRadius: 10, mixBlendMode: "lighten" }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, letterSpacing: "-0.02em" }}>Iceberg</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>The risk beneath your yield</div>
        </div>
      </div>
      <a href="https://x.com/CatDad0x" target="_blank" rel="noreferrer"
        style={{ fontSize: 12, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "6px 14px", textDecoration: "none" }}>
        Built by @CatDad0x ↗
      </a>
    </div>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

function SearchBar() {
  return (
    <div style={{ display: "flex", gap: 8, background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 10, marginBottom: 20 }}>
      <select style={{ background: SURF2, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "7px 12px", fontSize: 13, outline: "none" }}>
        <option>🔵 Base</option>
        <option>💎 Ethereum</option>
      </select>
      <input
        defaultValue={MOCK.txHash}
        readOnly
        style={{ flex: 1, background: SURF2, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "7px 12px", fontFamily: "monospace", fontSize: 11, outline: "none" }}
      />
      <button style={{ background: ICE, color: BG, border: "none", borderRadius: 10, padding: "7px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
        Analyze
      </button>
    </div>
  );
}

// ─── Hero row ─────────────────────────────────────────────────────────────────

function HeroRow() {
  const v = verdict(MOCK.riskScore);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
      {/* Score */}
      <Card style={{ gridColumn: "1", padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: ICE, lineHeight: 1, letterSpacing: "-0.04em" }}>{MOCK.riskScore}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>/ 100 Iceberg Score</div>
        <div style={{ marginTop: 10, padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, color: v.colour, background: `${v.colour}20` }}>
          {v.text}
        </div>
      </Card>
      {/* Protocol */}
      <Card style={{ padding: "18px 16px" }}>
        <div style={{ fontSize: 10, color: MUTED2, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Protocol</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{MOCK.protocol}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{MOCK.positionType}</div>
        <a href="https://aerodrome.finance" target="_blank" rel="noreferrer"
          style={{ display: "inline-block", marginTop: 10, fontSize: 11, color: ICE, textDecoration: "none" }}>
          aerodrome.finance ↗
        </a>
      </Card>
      {/* Pool */}
      <Card style={{ padding: "18px 16px" }}>
        <div style={{ fontSize: 10, color: MUTED2, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Pool</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{MOCK.pair}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{MOCK.feePercent}% fee tier</div>
        <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
          <Tag>CL pool</Tag>
          <Tag>Active</Tag>
        </div>
      </Card>
      {/* Chain */}
      <Card style={{ padding: "18px 16px" }}>
        <div style={{ fontSize: 10, color: MUTED2, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Chain</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>🔵 Base</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Coinbase L2 · Stage 1</div>
        <a href={MOCK.explorerTxUrl} target="_blank" rel="noreferrer"
          style={{ display: "inline-block", marginTop: 10, fontSize: 11, color: ICE, textDecoration: "none" }}>
          View on Basescan ↗
        </a>
      </Card>
    </div>
  );
}

// ─── Position map ─────────────────────────────────────────────────────────────

function PositionMap() {
  const statusStyle = (s: string): { circle: string; line: string } => {
    if (s === "done")      return { circle: "#22C55E", line: "#22C55E" };
    if (s === "current")   return { circle: ICE,       line: ICE };
    if (s === "missing")   return { circle: "#EF4444", line: BORDER };
    if (s === "recurring") return { circle: "#A78BFA", line: "#A78BFA" };
    return                        { circle: ICE_DIM,   line: BORDER };
  };

  return (
    <Card style={{ padding: "18px 20px", marginBottom: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 16 }}>Your Position Journey</div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        {FLOW.map((step, i) => {
          const ss = statusStyle(step.status);
          const isCurrent = step.status === "current";
          const isMissing = step.status === "missing";
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
              {/* connector line */}
              {i < FLOW.length - 1 && (
                <div style={{ position: "absolute", top: 14, left: "50%", width: "100%", height: 2, background: ss.line, zIndex: 0 }} />
              )}
              {/* circle */}
              <div style={{
                width: 28, height: 28, borderRadius: "50%", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                background: isCurrent ? ICE : isMissing ? "#EF444420" : `${ss.circle}25`,
                border: `2px solid ${ss.circle}`,
                boxShadow: isCurrent ? `0 0 12px ${ICE}60` : "none",
              }}>
                {isCurrent ? "★" : isMissing ? "✗" : step.icon}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? ICE : isMissing ? "#EF4444" : MUTED, textAlign: "center" }}>
                {step.title}
              </div>
              <div style={{ fontSize: 10, color: MUTED2, textAlign: "center", marginTop: 3, maxWidth: 90 }}>
                {step.detail}
              </div>
              {isMissing && (
                <div style={{ marginTop: 6, fontSize: 9, color: "#EF4444", background: "#EF444415", border: "1px solid #EF444430", borderRadius: 6, padding: "2px 7px" }}>
                  Not done
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Vulnerability assessment ─────────────────────────────────────────────────

function VulnerabilityAssessment() {
  const checks = MOCK.checks as VulnerabilityCheck[];
  return (
    <Card style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>Vulnerability Assessment</span>
          <span style={{ fontSize: 11, color: MUTED, background: SURF2, borderRadius: 10, padding: "2px 8px" }}>
            {checks.length} checks
          </span>
        </div>
        <span style={{ fontSize: 11, color: MUTED2 }}>Tap a row for details</span>
      </div>

      {/* Severity legend */}
      <div style={{ display: "flex", gap: 12, background: SURF2, borderRadius: 10, padding: "8px 12px", marginBottom: 14, flexWrap: "wrap" }}>
        {(["critical","high","medium","low","info"] as RiskLevel[]).map(lvl => (
          <span key={lvl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: SEV[lvl].dot.replace("bg-","") }} className={SEV[lvl].dot} />
            <span style={{ color: MUTED }}>{lvl.charAt(0).toUpperCase() + lvl.slice(1)}</span>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CATEGORY_ORDER.map(cat => {
          const inCat = checks.filter(c => c.category === cat);
          if (!inCat.length) return null;
          return <CategoryGroup key={cat} category={cat} checks={inCat} />;
        })}
      </div>
    </Card>
  );
}

function CategoryGroup({ category, checks }: { category: YIFFCategory; checks: VulnerabilityCheck[] }) {
  const [open, setOpen] = useState(false);
  const icon = CATEGORY_ICON[category];
  const highestSev = (["critical","high","medium","low","info"] as RiskLevel[]).find(
    s => checks.some(c => c.severity === s)
  ) ?? "info";

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{category}</span>
          <span style={{ fontSize: 10, color: MUTED, background: SURF2, borderRadius: 8, padding: "1px 7px" }}>{checks.length}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {checks.map((c, i) => (
              <span key={i} className={`${SEV[c.severity].dot}`}
                style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block" }} />
            ))}
          </div>
          <span style={{ color: MUTED2, fontSize: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${BORDER}` }}>
          {checks.map((c, i) => <CheckRow key={i} check={c} last={i === checks.length - 1} />)}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check, last }: { check: VulnerabilityCheck; last: boolean }) {
  const [open, setOpen] = useState(false);
  const sev = SEV[check.severity];
  return (
    <div style={{ borderBottom: last ? "none" : `1px solid ${BORDER}` }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", background: open ? SURF2 : "transparent", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
      >
        <span style={{ marginTop: 2, fontSize: 12, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          className={sev.dot.replace("bg-","bg-") + " bg-opacity-20 " + sev.dot}>
          {/* colored dot via className below */}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{check.title}</span>
            <span className={sev.pill} style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 8px" }}>
              {check.severity.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{check.finding}</div>
        </div>
        <span style={{ color: MUTED2, fontSize: 11, marginTop: 2, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: "10px 14px 14px 44px", background: SURF2 }}>
          <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.65, margin: 0 }}>{check.info}</p>
          {check.learnMoreUrl && (
            <a href={check.learnMoreUrl} target="_blank" rel="noreferrer"
              style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: ICE, textDecoration: "none" }}>
              Learn more ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Contract summary ─────────────────────────────────────────────────────────

const CONTRACTS = [
  { label: "Aerodrome SlipStream Pool", address: "0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59", age: "18mo old", verified: true, proxy: false },
  { label: "Aerodrome NFT Position Manager", address: "0x827922686190790b37229fd06084350e74485b72", age: "18mo old", verified: true, proxy: true },
  { label: "Aerodrome Router", address: "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43", age: "18mo old", verified: true, proxy: false },
];

function ContractSummary() {
  return (
    <Card style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 12 }}>Contract Analysis</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CONTRACTS.map((c, i) => (
          <ContractRow key={i} contract={c} />
        ))}
      </div>
    </Card>
  );
}

function ContractRow({ contract }: { contract: typeof CONTRACTS[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, textAlign: "left" }}>{contract.label}</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: MUTED, marginTop: 2 }}>
            {contract.address.slice(0, 10)}…{contract.address.slice(-6)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Tag>{contract.age}</Tag>
          {contract.verified && <Tag color="#22C55E">✓ Verified</Tag>}
          {contract.proxy  && <Tag color="#EAB308">Proxy</Tag>}
          <span style={{ color: MUTED2, fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </div>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: "10px 12px", background: SURF2 }}>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: MUTED, wordBreak: "break-all" }}>{contract.address}</div>
          <a href={`https://basescan.org/address/${contract.address}`} target="_blank" rel="noreferrer"
            style={{ display: "inline-block", marginTop: 6, fontSize: 11, color: ICE, textDecoration: "none" }}>
            View on Basescan ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Assets ───────────────────────────────────────────────────────────────────

function Assets() {
  return (
    <Card style={{ padding: "18px 16px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 12 }}>Assets in Position</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MOCK.assets.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: SURF2, borderRadius: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", marginTop: 4, flexShrink: 0 }} />
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{a.symbol}</span>
                <Tag color="#22C55E">✓ Trusted</Tag>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{a.name}</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: MUTED2, marginTop: 3 }}>
                {a.address.slice(0,10)}…{a.address.slice(-6)}
              </div>
              <ul style={{ marginTop: 6, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                {a.notes.map((n, j) => (
                  <li key={j} style={{ fontSize: 10, color: MUTED, display: "flex", gap: 5 }}>
                    <span style={{ color: MUTED2, flexShrink: 0 }}>·</span>{n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── What can go wrong ────────────────────────────────────────────────────────

function WhatCanGoWrong() {
  const impactColor = (i: string) =>
    i === "high" ? { bg: "#EF444420", text: "#EF4444", label: "HIGH" } :
    i === "medium" ? { bg: "#EAB30820", text: "#EAB308", label: "MED" } :
    { bg: "#22C55E20", text: "#22C55E", label: "LOW" };

  return (
    <Card style={{ padding: "18px 16px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 12 }}>What Can Go Wrong</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SCENARIOS.map((s, i) => {
          const ic = impactColor(s.impact);
          return (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", background: SURF2, borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{s.title}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: ic.text, background: ic.bg, borderRadius: 5, padding: "2px 7px" }}>{ic.label}</span>
                </div>
                <p style={{ fontSize: 11, color: MUTED, margin: 0, lineHeight: 1.55 }}>{s.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── How to protect ───────────────────────────────────────────────────────────

function HowToProtect() {
  return (
    <Card style={{ padding: "18px 16px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 12 }}>How to Protect Yourself</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {PROTECT.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#22C55E20", color: "#22C55E", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>✓</span>
            <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>{item}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 14, ...style }}>
      {children}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      color: color ?? MUTED,
      background: color ? `${color}18` : SURF2,
      border: `1px solid ${color ? `${color}30` : BORDER}`,
      borderRadius: 6, padding: "2px 7px",
    }}>
      {children}
    </span>
  );
}
