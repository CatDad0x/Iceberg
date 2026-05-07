"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "./components/ThemeToggle";

const SAMPLE_TX = "0x19e9fe153c5cdebaea8816ed4ff766f1aa47bb552bd97adc68ec1544bd656adb";
const SAMPLE_CHAIN = "base";

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
    label: "Who controls the protocol",
    icon: (
      <FeatureIcon>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </FeatureIcon>
    ),
  },
  {
    label: "Frontend & phishing analysis",
    icon: (
      <FeatureIcon>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </FeatureIcon>
    ),
  },
  {
    label: "Price change exposure",
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
  const router = useRouter();

  function handleAnalyze() {
    const hash = tx.trim();
    if (!hash) return;
    router.push(`/risk-tool?tx=${encodeURIComponent(hash)}&chain=${chain}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F7FA]">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 py-3 border-b border-slate-200 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Image src="/Logo.png" alt="Iceberg" width={30} height={30} className="rounded-lg" />
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
          src="/Logo.png"
          alt="Iceberg"
          width={220}
          height={220}
        />

        <h1 className="mt-8 text-5xl font-extrabold tracking-tight text-slate-900">
          The risk beneath your yield.
        </h1>
        <p className="mt-4 max-w-lg text-lg text-slate-500">
          Paste a transaction hash. Get a structured breakdown of smart contract risk, protocol controls, and yield exposure in seconds.
        </p>

        {/* Search bar */}
        <div className="mt-8 w-full max-w-2xl">
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
              placeholder="Paste a transaction hash (0x...)"
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
          href={`/risk-tool?tx=${SAMPLE_TX}&chain=${SAMPLE_CHAIN}`}
          className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          See a sample analysis
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10h12M10 4l6 6-6 6" />
          </svg>
        </Link>

        {/* Feature strip */}
        <div className="mt-14 w-full max-w-3xl">
          <div className="grid grid-cols-5 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex flex-col items-center gap-2.5 px-4 py-5 text-center">
                <span className="text-slate-400">{f.icon}</span>
                <span className="text-xs leading-snug text-slate-600">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between border-t border-slate-200 px-8 py-4 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span>Not financial advice</span>
          <span className="text-slate-300">•</span>
          <span>Verify findings independently</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
          </svg>
          <span>Supporting: Base, Ethereum (more coming soon)</span>
        </div>
      </footer>
    </div>
  );
}
