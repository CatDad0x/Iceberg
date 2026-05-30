// Persistent learned-cache for AI research results.
//
// Why: each AI research pass costs $0.15 to $0.40 on Anthropic. The same
// pool/contract set will produce essentially the same answer for 30 days, so
// we fingerprint and cache the AI response and skip the API call on repeat hits.
//
// Storage strategy (auto-detected at runtime):
//   • Vercel / serverless  → Upstash Redis (set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
//   • Local dev            → JSON file on disk (zero extra setup)

import crypto from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CachedEntry = {
  createdAt: string; // ISO timestamp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

// Version bump invalidates all old cache entries (bump when AI output schema changes).
const SCHEMA_VERSION = 4;

// Redis key prefix — includes schema version so old entries are naturally ignored.
const KEY_PREFIX = `iceberg:v${SCHEMA_VERSION}:`;

// ─── Cache key builder ────────────────────────────────────────────────────────

/**
 * Build a deterministic cache key from the inputs that influence the AI answer.
 * Two different transactions touching the same contracts + tokens on the same
 * chain hash to the same key and reuse the cache.
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

// ─── Backend detection ────────────────────────────────────────────────────────

function useRedis(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// ─── Redis backend ────────────────────────────────────────────────────────────

async function redisGet(key: string): Promise<CachedEntry | null> {
  const { Redis } = await import("@upstash/redis");
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  try {
    const value = await redis.get<CachedEntry>(KEY_PREFIX + key);
    return value ?? null;
  } catch (err) {
    console.warn("[learned-cache] Redis GET error:", err);
    return null;
  }
}

async function redisSet(key: string, entry: CachedEntry): Promise<void> {
  const { Redis } = await import("@upstash/redis");
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  try {
    await redis.set(KEY_PREFIX + key, entry, { ex: TTL_SECONDS });
  } catch (err) {
    console.warn("[learned-cache] Redis SET error:", err);
  }
}

// ─── File backend (local dev) ─────────────────────────────────────────────────

import { promises as fs } from "node:fs";
import path from "node:path";

const CACHE_FILE = path.join(process.cwd(), "app", "lib", "learned-cache.json");

type CacheFile = {
  version: number;
  entries: Record<string, CachedEntry>;
};

const EMPTY: CacheFile = { version: SCHEMA_VERSION, entries: {} };
let memCache: CacheFile | null = null;

async function fileRead(): Promise<CacheFile> {
  if (memCache) return memCache;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    memCache = parsed.version !== SCHEMA_VERSION ? { ...EMPTY } : parsed;
  } catch {
    memCache = { ...EMPTY };
  }
  return memCache;
}

async function fileWrite(cache: CacheFile): Promise<void> {
  memCache = cache;
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.warn("[learned-cache] file write failed:", err);
  }
}

async function fileGet(key: string): Promise<CachedEntry | null> {
  const cache = await fileRead();
  const entry = cache.entries[key];
  if (!entry) return null;
  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  if (ageMs > TTL_MS) {
    delete cache.entries[key];
    return null;
  }
  return entry;
}

async function fileSet(key: string, entry: CachedEntry): Promise<void> {
  const cache = await fileRead();
  cache.entries[key] = entry;
  await fileWrite(cache);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCached(key: string): Promise<CachedEntry | null> {
  if (useRedis()) return redisGet(key);
  return fileGet(key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function putCached(key: string, result: any): Promise<void> {
  const entry: CachedEntry = { createdAt: new Date().toISOString(), result };
  if (useRedis()) return redisSet(key, entry);
  return fileSet(key, entry);
}

export async function cacheStats(): Promise<{ entries: number; ttlDays: number; backend: string }> {
  if (useRedis()) {
    return { entries: -1, ttlDays: TTL_DAYS, backend: "upstash-redis" };
  }
  const cache = await fileRead();
  return { entries: Object.keys(cache.entries).length, ttlDays: TTL_DAYS, backend: "file" };
}
