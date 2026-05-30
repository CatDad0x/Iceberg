"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "./components/ThemeToggle";

const SAMPLE_TX = "0x19e9fe153c5cdebaea8816ed4ff766f1aa47bb552bd97adc68ec1544bd656adb";
const SAMPLE_CHAIN = "base";

// ─── Supported protocols ──────────────────────────────────────────────────────

type Protocol = { name: string; chain: "base" | "ethereum"; iconUrl: string };

const SUPPORTED_PROTOCOLS: Protocol[] = [
  { name: "Aerodrome",   chain: "base",     iconUrl: "https://icons.llama.fi/aerodrome.png" },
  { name: "Uniswap",    chain: "base",     iconUrl: "https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png" },
  { name: "Curve",      chain: "base",     iconUrl: "https://icons.llama.fi/curve.png" },
  { name: "Equalizer",  chain: "base",     iconUrl: "https://icons.llama.fi/equalizer.png" },
  { name: "Balancer",   chain: "ethereum", iconUrl: "https://icons.llama.fi/balancer.png" },
  { name: "SushiSwap",  chain: "ethereum", iconUrl: "https://icons.llama.fi/sushiswap.png" },
  { name: "PancakeSwap", chain: "ethereum", iconUrl: "https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo_%281%29.png" },
];

// ─── Recent searches (localStorage) ──────────────────────────────────────────

type RecentSearch = { input: string; chain: "base" | "ethereum"; ts: number };
const RECENT_KEY = "iceberg_recent_searches";
const MAX_RECENT = 5;

function loadRecent(): RecentSearch[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch { return []; }
}

export function saveRecentSearch(input: string, chain: "base" | "ethereum") {
  try {
    const existing = loadRecent().filter((r) => r.input !== input);
    const updated: RecentSearch[] = [{ input, chain, ts: Date.now() }, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const FEATURES = [
  {
    label: "Smart contract checks",
    icon: (
      <FeatureIcon>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </FeatureIcon>
    ),
  },
  {
    label: "Admin & oracle risks",
    icon: (
      <FeatureIcon>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </FeatureIcon>
    ),
  },
  {
    label: "Frontend & phishing checks",
    icon: (
      <FeatureIcon>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </FeatureIcon>
    ),
  },
  {
    label: "IL & market exposure",
    icon: (
      <FeatureIcon>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </FeatureIcon>
    ),
  },
  {
    label: "Plain-English explanations",
    icon: (
      <FeatureIcon>
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </FeatureIcon>
    ),
  },
];

function ProtocolChip({ protocol }: { protocol: Protocol }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="group relative flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm hover:border-slate-300 transition-colors" title={protocol.name}>
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={protocol.iconUrl}
          alt={protocol.name}
          width={32}
          height={32}
          className="rounded-full object-cover"
          onError={() => setImgOk(false)}
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
          {protocol.name.charAt(0)}
        </span>
      )}
    </div>
  );
}

function ChainDot({ chain }: { chain: string }) {
  const bg = chain === "base" ? "bg-blue-600" : "bg-indigo-500";
  const label = chain === "base" ? "B" : "E";
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${bg}`}>
      {label}
    </span>
  );
}

export default function LandingPage() {
  const [chain, setChain] = useState<"base" | "ethereum">("base");
  const [tx, setTx] = useState("");
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const router = useRouter();

  useEffect(() => { setRecents(loadRecent()); }, []);

  function handleAnalyze() {
    const hash = tx.trim();
    if (!hash) return;
    // Fix #8: don't save to recents before we know the input is valid.
    // The risk-tool page calls saveRecentSearch after a successful analysis.
    router.push(`/risk-tool?input=${encodeURIComponent(hash)}&chain=${chain}`);
  }

  function handleRecent(r: RecentSearch) {
    router.push(`/risk-tool?input=${encodeURIComponent(r.input)}&chain=${r.chain}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F7FA]">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 py-3 border-b border-slate-200 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Image src="/Logo.svg" alt="Iceberg" width={30} height={30} className="rounded-lg" />
          <span className="text-[16px] font-semibold text-slate-900">Iceberg</span>
          <span className="text-slate-300 select-none">|</span>
          <span className="text-sm text-slate-500">The risk beneath your yield.</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a
            href="https://x.com/CatDad0x"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Image src="/cat-dad.png" alt="CatDad0x" width={26} height={26} className="rounded-full" />
            Built by @CatDad0x
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">

        <Image
          src="/Logo.svg"
          alt="Iceberg"
          width={220}
          height={220}
        />

        <h1 className="mt-8 text-5xl font-extrabold tracking-tight text-slate-900">
          The risk beneath your yield.
        </h1>
        <p className="mt-4 max-w-lg text-lg text-slate-500">
          Paste a transaction hash or pool address.<br />
          Get a structured, plain-English risk report in seconds.
        </p>

        {/* Search bar */}
        <div className="mt-8 w-full max-w-2xl px-2 sm:px-0">
          <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-md">
            <div className="flex shrink-0 items-center gap-1.5 border-r border-slate-200 pr-3">
              <ChainDot chain={chain} />
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value as "base" | "ethereum")}
                className="cursor-pointer bg-transparent text-sm font-medium text-slate-700 outline-none"
              >
                <option value="base">Base</option>
                <option value="ethereum">Ethereum</option>
              </select>
            </div>
            <input
              type="text"
              value={tx}
              onChange={(e) => setTx(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="Paste a transaction hash or pool address…"
              className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-slate-700 placeholder-slate-400 outline-none"
            />
            <button
              onClick={handleAnalyze}
              className="shrink-0 rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
              Analyze
            </button>
          </div>
        </div>

        <Link
          href={`/risk-tool?input=${SAMPLE_TX}&chain=${SAMPLE_CHAIN}`}
          className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          See a sample analysis
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10h12M10 4l6 6-6 6" />
          </svg>
        </Link>

        {/* Feature strip */}
        <div className="mt-14 w-full max-w-3xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {FEATURES.map((f, i) => (
              <div key={i} className={`flex flex-col items-center gap-2.5 px-4 py-5 text-center border-b border-slate-200 sm:border-b-0 ${i % 2 === 1 ? "border-l border-slate-200" : ""} ${i >= 4 ? "border-b-0" : ""}`}>
                <span className="text-slate-400">{f.icon}</span>
                <span className="text-xs leading-snug text-slate-600">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* ── Footer ── */}
      <footer className="flex items-center justify-center gap-3 border-t border-slate-200 px-8 py-4 text-xs text-slate-500">
        <span>Not financial advice</span>
        <span className="text-slate-300">•</span>
        <span>Verify findings independently</span>
      </footer>
    </div>
  );
}
