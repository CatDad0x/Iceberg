"use client";

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

// ─── Types ───────────────────────────────────────────────────────────────────

type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

type VulnerabilityCheck = {
  category: string;
  title: string;
  severity: RiskLevel;
  finding: string;
  info: string;
  laymanTerms?: string;
};

type Finding = { title: string; detail: string; level: RiskLevel };

type ContractRisk = {
  address: string;
  label: string;
  poolType?: string;
  findings: Finding[];
  isProxy?: boolean;
  implementation?: string;
  isVerified?: boolean;
  deployedAt?: number;
};

type PositionOverview = {
  protocol: string;
  pair?: string;
  feePercent?: number;
  positionType: string;
  chain: string;
  explorerTxUrl: string;
};

type AnalysisResult = {
  txHash: string;
  chain: string;
  riskScore: number;
  positionOverview: PositionOverview;
  contracts: ContractRisk[];
  aiNarrative: string;
  vulnerabilityChecks: VulnerabilityCheck[];
  scenariosThatCanGoWrong: { title: string; description: string; impact: string; icon: string }[];
  howToProtectYourself: string[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<RiskLevel, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#B45309",
  low: "#16A34A",
  info: "#94A3B8",
};

const SEVERITY_BG: Record<RiskLevel, string> = {
  critical: "#FEF2F2",
  high: "#FFF7ED",
  medium: "#FFFBEB",
  low: "#F0FDF4",
  info: "#F8FAFC",
};

const SEVERITY_LABEL: Record<RiskLevel, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

const CATEGORY_ORDER = [
  "Protocol Security",
  "Pool Security",
  "Governance & Control",
  "Position Economics",
];

const CATEGORY_WEIGHT: Record<string, string> = {
  "Protocol Security": "30%",
  "Pool Security": "10%",
  "Governance & Control": "50%",
  "Position Economics": "10%",
};

function verdict(score: number): { text: string; color: string; bg: string } {
  if (score >= 90) return { text: "Excellent", color: "#15803D", bg: "#F0FDF4" };
  if (score >= 80) return { text: "Very Good", color: "#16A34A", bg: "#F0FDF4" };
  if (score >= 70) return { text: "Good", color: "#0F766E", bg: "#F0FDFA" };
  if (score >= 60) return { text: "Fair", color: "#A16207", bg: "#FEFCE8" };
  if (score >= 50) return { text: "Borderline", color: "#C2410C", bg: "#FFF7ED" };
  if (score >= 30) return { text: "Risky", color: "#B45309", bg: "#FFF7ED" };
  if (score >= 20) return { text: "Very Risky", color: "#DC2626", bg: "#FEF2F2" };
  return { text: "Critical Risk", color: "#991B1B", bg: "#FEF2F2" };
}

function formatAge(ts: number): string {
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days < 1) return "today";
  if (days < 30) return `${days}d old`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo old`;
  return `${Math.floor(months / 12)}yr old`;
}

function countsByLevel(checks: VulnerabilityCheck[]) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const c of checks) {
    const key = c.severity as RiskLevel;
    if (key in counts) counts[key]++;
  }
  return counts;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1B1B2F",
    backgroundColor: "#FFFFFF",
    paddingBottom: 50,
  },

  // Fixed header on every page
  pageHeader: {
    backgroundColor: "#1B1B2F",
    paddingHorizontal: 40,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  pageHeaderLogo: {
    width: 26,
    height: 26,
    marginRight: 10,
  },
  pageHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  pageHeaderSub: {
    color: "#94A3B8",
    fontSize: 7.5,
    marginTop: 2,
  },
  pageHeaderRight: {
    alignItems: "flex-end",
  },
  pageHeaderDate: {
    color: "#94A3B8",
    fontSize: 7.5,
  },
  pageHeaderTx: {
    color: "#64748B",
    fontSize: 6.5,
    fontFamily: "Courier",
    marginTop: 3,
  },

  // Fixed footer on every page
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#F8FAFC",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 40,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 7,
    color: "#94A3B8",
  },

  // Content wrapper
  content: {
    paddingHorizontal: 40,
    paddingTop: 24,
  },

  // Score hero
  scoreHero: {
    flexDirection: "row",
    marginBottom: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  scoreLeft: {
    backgroundColor: "#1E4E6E",
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  scoreNumber: {
    color: "#FFFFFF",
    fontSize: 56,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1,
  },
  scoreOutOf: {
    color: "#A8D5E2",
    fontSize: 10,
    marginTop: 2,
  },
  scoreIcebergLabel: {
    color: "#A8D5E2",
    fontSize: 7,
    letterSpacing: 1.2,
    marginTop: 6,
  },
  scoreRight: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 18,
  },
  verdictRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  verdictBadge: {
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginRight: 10,
  },
  verdictText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  scoreSummary: {
    fontSize: 8.5,
    color: "#5B6B7E",
    lineHeight: 1.55,
    flex: 1,
    flexWrap: "wrap",
  },
  countRow: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  countItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  countDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  countText: {
    fontSize: 8,
    color: "#5B6B7E",
  },

  // Position cards
  positionRow: {
    flexDirection: "row",
    marginBottom: 20,
  },
  positionCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 6,
    padding: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  positionCardLast: {
    marginRight: 0,
  },
  positionCardLabel: {
    fontSize: 7,
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  positionCardValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1B1B2F",
  },
  positionCardSub: {
    fontSize: 7.5,
    color: "#5B6B7E",
    marginTop: 3,
  },

  // Section headings
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 4,
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1B1B2F",
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: "#F1F5F9",
    borderRadius: 100,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 8,
    color: "#5B6B7E",
  },

  // YIFF score breakdown
  breakdownTable: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    overflow: "hidden",
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  breakdownRowLast: {
    borderBottomWidth: 0,
  },
  breakdownRowHeader: {
    backgroundColor: "#F8FAFC",
    paddingVertical: 6,
  },
  breakdownHeaderText: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#94A3B8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  breakdownCategory: {
    fontSize: 8.5,
    color: "#1B1B2F",
    width: 140,
  },
  breakdownWeight: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1E4E6E",
    width: 32,
    textAlign: "right",
  },
  breakdownBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 3,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  breakdownBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1E4E6E",
  },
  breakdownCritical: {
    fontSize: 8,
    color: "#DC2626",
    width: 26,
    textAlign: "center",
  },
  breakdownHigh: {
    fontSize: 8,
    color: "#EA580C",
    width: 26,
    textAlign: "center",
  },
  breakdownMedium: {
    fontSize: 8,
    color: "#B45309",
    width: 26,
    textAlign: "center",
  },

  // Category group
  categoryGroup: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    overflow: "hidden",
  },
  categoryGroupHeader: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  categoryGroupName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1B1B2F",
    flex: 1,
  },
  categoryGroupCount: {
    fontSize: 8,
    color: "#94A3B8",
  },

  // Check row
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
    marginTop: 1,
    flexShrink: 0,
  },
  checkBody: {
    flex: 1,
  },
  checkTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  checkTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#1B1B2F",
    marginRight: 6,
  },
  severityPill: {
    borderRadius: 100,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  severityPillText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  checkFinding: {
    fontSize: 7.5,
    color: "#5B6B7E",
    marginTop: 3,
    lineHeight: 1.5,
  },
  checkInfo: {
    fontSize: 7.5,
    color: "#64748B",
    marginTop: 3,
    lineHeight: 1.5,
    backgroundColor: "#F8FAFC",
    padding: 6,
    borderRadius: 4,
  },

  // Contract box
  contractBox: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    marginBottom: 8,
    overflow: "hidden",
  },
  contractHeader: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  contractLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1B1B2F",
  },
  contractAddress: {
    fontSize: 7,
    color: "#1E4E6E",
    fontFamily: "Courier",
    marginTop: 2,
  },
  contractMeta: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  contractMetaItem: {
    fontSize: 7.5,
    color: "#5B6B7E",
    marginRight: 16,
  },
  contractFinding: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },

  // Key takeaways
  takeawayItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  takeawayBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#CBD5E1",
    marginRight: 9,
    marginTop: 4,
    flexShrink: 0,
  },
  takeawayText: {
    fontSize: 8.5,
    color: "#1B1B2F",
    flex: 1,
    lineHeight: 1.55,
  },

  // What can go wrong
  scenarioRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  scenarioImpactPill: {
    borderRadius: 100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 10,
    marginTop: 1,
    flexShrink: 0,
  },
  scenarioImpactText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  scenarioTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#1B1B2F",
    marginBottom: 2,
  },
  scenarioDesc: {
    fontSize: 7.5,
    color: "#5B6B7E",
    lineHeight: 1.5,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 16,
  },

  pageBreak: {
    marginTop: 20,
  },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHeader({ result, logoUrl }: { result: AnalysisResult; logoUrl: string }) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <View style={S.pageHeader} fixed>
      <View style={S.pageHeaderLeft}>
        <Image style={S.pageHeaderLogo} src={logoUrl} />
        <View>
          <Text style={S.pageHeaderTitle}>ICEBERG RISK REPORT</Text>
          <Text style={S.pageHeaderSub}>
            {result.positionOverview.protocol}
            {result.positionOverview.pair ? `  ·  ${result.positionOverview.pair}` : ""}
            {"  ·  "}{result.chain.charAt(0).toUpperCase() + result.chain.slice(1)}
          </Text>
        </View>
      </View>
      <View style={S.pageHeaderRight}>
        <Text style={S.pageHeaderDate}>{date}</Text>
        <Text style={S.pageHeaderTx}>
          {result.txHash.slice(0, 10)}…{result.txHash.slice(-8)}
        </Text>
      </View>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>
        Iceberg  ·  Not financial advice  ·  Verify all findings independently
      </Text>
      <Text style={S.footerText} render={({ pageNumber, totalPages }) =>
        `Page ${pageNumber} of ${totalPages}`
      } />
    </View>
  );
}

function ScoreHero({ result }: { result: AnalysisResult }) {
  const v = verdict(result.riskScore);
  const counts = countsByLevel(result.vulnerabilityChecks);
  const truncatedNarrative = result.aiNarrative
    .split(/(?<=[.!?])\s+/)
    .slice(0, 3)
    .join(" ");

  return (
    <View style={S.scoreHero} wrap={false}>
      <View style={S.scoreLeft}>
        <Text style={S.scoreNumber}>{result.riskScore}</Text>
        <Text style={S.scoreOutOf}>/100</Text>
        <Text style={S.scoreIcebergLabel}>ICEBERG SCORE</Text>
      </View>
      <View style={S.scoreRight}>
        <View style={S.verdictRow}>
          <View style={[S.verdictBadge, { backgroundColor: v.bg }]}>
            <Text style={[S.verdictText, { color: v.color }]}>{v.text}</Text>
          </View>
        </View>
        <Text style={S.scoreSummary}>{truncatedNarrative}</Text>
        <View style={S.countRow}>
          <View style={S.countItem}>
            <View style={[S.countDot, { backgroundColor: "#DC2626" }]} />
            <Text style={S.countText}>{counts.critical} critical</Text>
          </View>
          <View style={S.countItem}>
            <View style={[S.countDot, { backgroundColor: "#EA580C" }]} />
            <Text style={S.countText}>{counts.high} high</Text>
          </View>
          <View style={S.countItem}>
            <View style={[S.countDot, { backgroundColor: "#B45309" }]} />
            <Text style={S.countText}>{counts.medium} medium</Text>
          </View>
          <View style={S.countItem}>
            <View style={[S.countDot, { backgroundColor: "#16A34A" }]} />
            <Text style={S.countText}>{counts.low} low</Text>
          </View>
          <View style={S.countItem}>
            <View style={[S.countDot, { backgroundColor: "#94A3B8" }]} />
            <Text style={S.countText}>{counts.info} info</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function PositionCards({ result }: { result: AnalysisResult }) {
  return (
    <View style={S.positionRow} wrap={false}>
      <View style={S.positionCard}>
        <Text style={S.positionCardLabel}>Protocol</Text>
        <Text style={S.positionCardValue}>{result.positionOverview.protocol}</Text>
        <Text style={S.positionCardSub}>{result.positionOverview.positionType}</Text>
      </View>
      <View style={S.positionCard}>
        <Text style={S.positionCardLabel}>Pool</Text>
        <Text style={S.positionCardValue}>{result.positionOverview.pair ?? "Unknown"}</Text>
        <Text style={S.positionCardSub}>
          {result.positionOverview.feePercent !== undefined
            ? `${result.positionOverview.feePercent}% fee tier`
            : "Fee unknown"}
        </Text>
      </View>
      <View style={S.positionCard}>
        <Text style={S.positionCardLabel}>Chain</Text>
        <Text style={S.positionCardValue}>
          {result.chain.charAt(0).toUpperCase() + result.chain.slice(1)}
        </Text>
        <Text style={S.positionCardSub}>
          {result.chain === "base" ? "Coinbase L2 Rollup" : "Layer 1"}
        </Text>
      </View>
      <View style={[S.positionCard, S.positionCardLast]}>
        <Text style={S.positionCardLabel}>Transaction</Text>
        <Text style={[S.positionCardValue, { fontSize: 8, fontFamily: "Courier" }]}>
          {result.txHash.slice(0, 12)}…{result.txHash.slice(-10)}
        </Text>
        <Text style={S.positionCardSub}>{result.chain === "base" ? "Basescan" : "Etherscan"}</Text>
      </View>
    </View>
  );
}

function ScoreBreakdown({ checks }: { checks: VulnerabilityCheck[] }) {
  const rows = CATEGORY_ORDER.map((cat) => {
    const inCat = checks.filter((c) => c.category === cat);
    const counts = countsByLevel(inCat);
    const catWeight = parseInt(CATEGORY_WEIGHT[cat] ?? "0");
    return { cat, counts, catWeight, total: inCat.length };
  });

  return (
    <View wrap={false}>
      <View style={S.sectionHeading}>
        <Text style={S.sectionTitle}>Risk Score Breakdown</Text>
        <Text style={S.sectionBadge}>YIFF-aligned weights</Text>
      </View>
      <View style={S.breakdownTable}>
        <View style={[S.breakdownRow, S.breakdownRowHeader]}>
          <Text style={[S.breakdownHeaderText, { width: 140 }]}>Category</Text>
          <Text style={[S.breakdownHeaderText, { width: 32, textAlign: "right" }]}>Weight</Text>
          <Text style={[S.breakdownHeaderText, { flex: 1, marginHorizontal: 12 }]}>Distribution</Text>
          <Text style={[S.breakdownHeaderText, { width: 26, textAlign: "center" }]}>Crit</Text>
          <Text style={[S.breakdownHeaderText, { width: 26, textAlign: "center" }]}>High</Text>
          <Text style={[S.breakdownHeaderText, { width: 26, textAlign: "center" }]}>Med</Text>
        </View>
        {rows.map((r, i) => {
          const barPct = r.total > 0
            ? Math.max(5, 100 - ((r.counts.critical * 25 + r.counts.high * 12 + r.counts.medium * 5) / r.total) * 10)
            : 100;
          const barColor =
            r.counts.critical > 0 ? "#DC2626"
            : r.counts.high > 0 ? "#EA580C"
            : r.counts.medium > 0 ? "#B45309"
            : "#16A34A";
          return (
            <View
              key={r.cat}
              style={[
                S.breakdownRow,
                i === rows.length - 1 ? S.breakdownRowLast : {},
              ]}
            >
              <Text style={S.breakdownCategory}>{r.cat}</Text>
              <Text style={S.breakdownWeight}>{CATEGORY_WEIGHT[r.cat]}</Text>
              <View style={S.breakdownBarContainer}>
                <View style={[S.breakdownBarFill, { width: `${barPct}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={S.breakdownCritical}>{r.counts.critical > 0 ? r.counts.critical : "—"}</Text>
              <Text style={S.breakdownHigh}>{r.counts.high > 0 ? r.counts.high : "—"}</Text>
              <Text style={S.breakdownMedium}>{r.counts.medium > 0 ? r.counts.medium : "—"}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function VulnerabilitySection({ checks }: { checks: VulnerabilityCheck[] }) {
  return (
    <View>
      <View style={S.sectionHeading}>
        <Text style={S.sectionTitle}>Vulnerability Assessment</Text>
        <Text style={S.sectionBadge}>{checks.length} checks</Text>
      </View>
      {CATEGORY_ORDER.map((cat) => {
        const inCat = checks.filter((c) => c.category === cat);
        if (inCat.length === 0) return null;
        // Token Risk first in Position Economics
        const sorted = cat === "Position Economics"
          ? [
              ...inCat.filter((c) => c.title.toLowerCase().includes("token risk")),
              ...inCat.filter((c) => !c.title.toLowerCase().includes("token risk")),
            ]
          : inCat;

        return (
          <View key={cat} style={S.categoryGroup} wrap={false}>
            <View style={S.categoryGroupHeader}>
              <Text style={S.categoryGroupName}>{cat}</Text>
              <Text style={S.categoryGroupCount}>
                {inCat.length} {inCat.length === 1 ? "check" : "checks"}  ·  {CATEGORY_WEIGHT[cat]} weight
              </Text>
            </View>
            {sorted.map((check, i) => (
              <View
                key={i}
                style={[
                  S.checkRow,
                  i === sorted.length - 1 ? { borderBottomWidth: 0 } : {},
                ]}
              >
                <View style={[S.checkDot, { backgroundColor: SEVERITY_COLOR[check.severity] }]} />
                <View style={S.checkBody}>
                  <View style={S.checkTitleRow}>
                    <Text style={S.checkTitle}>{check.title}</Text>
                    <View style={[S.severityPill, { backgroundColor: SEVERITY_BG[check.severity], flexShrink: 0 }]}>
                      <Text style={[S.severityPillText, { color: SEVERITY_COLOR[check.severity] }]}>
                        {SEVERITY_LABEL[check.severity]}
                      </Text>
                    </View>
                  </View>
                  <Text style={S.checkFinding}>{check.finding}</Text>
                  {check.severity !== "info" && check.info && (
                    <Text style={S.checkInfo}>{check.info}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function ContractSection({ contracts, chain }: { contracts: ContractRisk[]; chain: string }) {
  if (contracts.length === 0) return null;
  const explorerBase = chain === "base" ? "basescan.org" : "etherscan.io";
  return (
    <View>
      <View style={S.sectionHeading}>
        <Text style={S.sectionTitle}>Contract Analysis</Text>
        <Text style={S.sectionBadge}>{contracts.length} {contracts.length === 1 ? "contract" : "contracts"}</Text>
      </View>
      {contracts.map((c, i) => (
        <View key={i} style={S.contractBox} wrap={false}>
          <View style={S.contractHeader}>
            <Text style={S.contractLabel}>{c.label}</Text>
            <Text style={S.contractAddress}>{c.address}</Text>
            <Text style={[S.contractAddress, { color: "#94A3B8", marginTop: 1 }]}>
              {explorerBase}/address/{c.address}
            </Text>
          </View>
          {(c.isVerified !== undefined || c.deployedAt || c.poolType) && (
            <View style={S.contractMeta}>
              {c.isVerified !== undefined && (
                <Text style={[S.contractMetaItem, { color: c.isVerified ? "#16A34A" : "#EA580C", fontFamily: "Helvetica-Bold" }]}>
                  {c.isVerified ? "✓ Verified source" : "✗ Unverified"}
                </Text>
              )}
              {c.deployedAt && (
                <Text style={S.contractMetaItem}>Deployed: {formatAge(c.deployedAt)}</Text>
              )}
              {c.isProxy && (
                <Text style={[S.contractMetaItem, { color: "#B45309" }]}>Proxy contract</Text>
              )}
              {c.poolType && c.poolType !== "unknown" && (
                <Text style={S.contractMetaItem}>Type: {c.poolType}</Text>
              )}
            </View>
          )}
          {c.findings.length > 0 && c.findings.map((f, j) => (
            <View
              key={j}
              style={[
                S.contractFinding,
                j === c.findings.length - 1 ? { borderBottomWidth: 0 } : {},
              ]}
            >
              <View style={[S.checkDot, { backgroundColor: SEVERITY_COLOR[f.level] }]} />
              <View style={{ flex: 1 }}>
                <Text style={[S.checkTitle, { fontSize: 8 }]}>{f.title}</Text>
                <Text style={S.checkFinding}>{f.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function KeyTakeaways({ narrative }: { narrative: string }) {
  const sentences = narrative
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/^(and|but|so|however|also),?\s+/i, ""))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .filter((s) => s.length > 20)
    .slice(0, 8);

  if (sentences.length === 0) return null;

  return (
    <View wrap={false}>
      <View style={S.sectionHeading}>
        <Text style={S.sectionTitle}>Key Takeaways</Text>
      </View>
      <View style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 6, overflow: "hidden", padding: 12 }}>
        {sentences.map((s, i) => (
          <View key={i} style={[S.takeawayItem, i === sentences.length - 1 ? { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 } : {}]}>
            <View style={S.takeawayBullet} />
            <Text style={S.takeawayText}>{s}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScenariosSection({ scenarios }: { scenarios: AnalysisResult["scenariosThatCanGoWrong"] }) {
  if (scenarios.length === 0) return null;
  const impactColor = (i: string) =>
    i === "high" ? { bg: "#FEF2F2", text: "#DC2626", label: "HIGH" }
    : i === "medium" ? { bg: "#FFFBEB", text: "#B45309", label: "MED" }
    : { bg: "#F0FDF4", text: "#16A34A", label: "LOW" };

  return (
    <View>
      <View style={S.sectionHeading}>
        <Text style={S.sectionTitle}>What Can Go Wrong</Text>
        <Text style={S.sectionBadge}>{scenarios.length} scenarios</Text>
      </View>
      <View style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 6, overflow: "hidden" }}>
        {scenarios.map((s, i) => {
          const ic = impactColor(s.impact);
          return (
            <View
              key={i}
              style={[
                S.scenarioRow,
                i === scenarios.length - 1 ? { borderBottomWidth: 0 } : {},
              ]}
            >
              <View style={[S.scenarioImpactPill, { backgroundColor: ic.bg }]}>
                <Text style={[S.scenarioImpactText, { color: ic.text }]}>{ic.label}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.scenarioTitle}>{s.title}</Text>
                <Text style={S.scenarioDesc}>{s.description}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HowToProtect({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View wrap={false}>
      <View style={S.sectionHeading}>
        <Text style={S.sectionTitle}>How to Protect Yourself</Text>
      </View>
      <View style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 6, overflow: "hidden", padding: 12 }}>
        {items.map((item, i) => (
          <View
            key={i}
            style={[
              S.takeawayItem,
              i === items.length - 1 ? { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 } : {},
            ]}
          >
            <View style={[S.takeawayBullet, { backgroundColor: "#16A34A" }]} />
            <Text style={S.takeawayText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main PDF Document ────────────────────────────────────────────────────────

export function RiskReportPDF({
  result,
  logoUrl,
}: {
  result: AnalysisResult;
  logoUrl: string;
}) {
  return (
    <Document
      title={`Iceberg Risk Report — ${result.positionOverview.protocol}${result.positionOverview.pair ? ` ${result.positionOverview.pair}` : ""}`}
      author="Iceberg"
      subject="DeFi Risk Analysis"
      creator="Iceberg Risk Tool"
    >
      <Page size="A4" style={S.page}>
        <PageHeader result={result} logoUrl={logoUrl} />
        <PageFooter />

        <View style={S.content}>
          {/* Score hero */}
          <ScoreHero result={result} />

          {/* Position cards */}
          <PositionCards result={result} />

          {/* YIFF score breakdown */}
          <ScoreBreakdown checks={result.vulnerabilityChecks} />

          {/* Key takeaways */}
          <View style={S.divider} />
          <KeyTakeaways narrative={result.aiNarrative} />

          {/* Vulnerability assessment */}
          <View style={S.divider} />
          <VulnerabilitySection checks={result.vulnerabilityChecks} />

          {/* Contract analysis */}
          <View style={S.divider} />
          <ContractSection contracts={result.contracts} chain={result.chain} />

          {/* Scenarios & protection */}
          {result.scenariosThatCanGoWrong.length > 0 && (
            <>
              <View style={S.divider} />
              <ScenariosSection scenarios={result.scenariosThatCanGoWrong} />
            </>
          )}
          {result.howToProtectYourself.length > 0 && (
            <>
              <View style={S.divider} />
              <HowToProtect items={result.howToProtectYourself} />
            </>
          )}

          {/* Disclaimer */}
          <View style={[S.divider, { marginTop: 24 }]} />
          <Text style={{ fontSize: 7.5, color: "#94A3B8", lineHeight: 1.6, textAlign: "center" }}>
            This report is generated automatically by the Iceberg risk analysis tool. It is not financial advice and should not be relied upon as the sole basis for investment decisions. All findings should be independently verified. Risk scores are indicative only and based on data available at the time of analysis.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
