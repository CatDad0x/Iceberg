// Persistent learned-cache for AI research results.
//
// Why: each AI research pass costs $0.15 to $0.40 on Anthropic. The same
// pool/contract set will produce essentially the same answer for 30 days, so
// we fingerprint and cache the AI response on disk and skip the API call on
// subsequent analyses.
//
// Storage: JSON file on disk. Works in local dev and any environment with a
// writable filesystem. PRODUCTION TODO: when deploying to Vercel/serverless,
// swap `readCache` / `writeCache` to use Vercel KV or Upstash Redis. The
// rest of the module stays the same.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CACHE_FILE = path.join(process.cwd(), "app", "lib", "learned-cache.json");
const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
// Bumped to 4: AI prompt example JSON replaced with schema skeleton to prevent
// the model from copy-pasting example findings into real output (caused contradictions).
const SCHEMA_VERSION = 4;

// Shape of one cached entry. `result` is the AI response object (narrative,
// vulnerabilityChecks, sources, etc.) — we store it opaquely so this module
// doesn't need to know the AI shape and stays decoupled.
export type CachedEntry = {
  createdAt: string; // ISO timestamp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
};

type CacheFile = {
  version: number;
  entries: Record<string, CachedEntry>;
};

const EMPTY: CacheFile = { version: SCHEMA_VERSION, entries: {} };

// In-memory mirror to avoid repeated disk reads within a single request.
// Reset on cold start which is fine — the file is the source of truth.
let memCache: CacheFile | null = null;

/**
 * Build a deterministic cache key from the inputs that would influence the
 * AI's answer. Two different transactions touching the same set of contracts
 * and tokens on the same chain will hash to the same key and reuse the cache.
 */
export function buildCacheKey(opts: {
  chain: string;
  contractAddresses: string[];
  tokenAddresses: string[];
}): string {
  const norm = (xs: string[]) =>
    xs.map((s) => s.toLowerCase()).sort().join(",");
  const fingerprint = [
    `chain:${opts.chain.toLowerCase()}`,
    `contracts:${norm(opts.contractAddresses)}`,
    `tokens:${norm(opts.tokenAddresses)}`,
  ].join("|");
  return crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 24);
}

async function readCache(): Promise<CacheFile> {
  if (memCache) return memCache;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    if (parsed.version !== SCHEMA_VERSION) {
      // Schema change: ignore old data, start fresh. Could migrate here later.
      memCache = { ...EMPTY };
    } else {
      memCache = parsed;
    }
  } catch {
    // First run, file missing, or unreadable. Start with an empty cache.
    memCache = { ...EMPTY };
  }
  return memCache;
}

async function writeCache(cache: CacheFile): Promise<void> {
  memCache = cache;
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    // Read-only filesystem (e.g. Vercel runtime). Log and continue: we just
    // lose the persistence benefit for this request, the response still works.
    console.warn("[learned-cache] write failed (likely read-only fs):", err);
  }
}

export async function getCached(key: string): Promise<CachedEntry | null> {
  const cache = await readCache();
  const entry = cache.entries[key];
  if (!entry) return null;

  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  if (ageMs > TTL_MS) {
    // Expired. Drop it from memory; will get overwritten on next put.
    delete cache.entries[key];
    return null;
  }

  return entry;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function putCached(key: string, result: any): Promise<void> {
  const cache = await readCache();
  cache.entries[key] = {
    createdAt: new Date().toISOString(),
    result,
  };
  await writeCache(cache);
}

/**
 * Stats for debugging / admin endpoint. Not used in the request path.
 */
export async function cacheStats(): Promise<{ entries: number; ttlDays: number }> {
  const cache = await readCache();
  return { entries: Object.keys(cache.entries).length, ttlDays: TTL_DAYS };
}
