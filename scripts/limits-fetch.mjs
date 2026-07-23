#!/usr/bin/env node

// scripts/limits-fetch.entry.ts
import { execFile as execFile2 } from "node:child_process";
import { readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { chmod as chmod2, mkdir as mkdir2, readFile as readFile2, rename, rm, writeFile as writeFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, join } from "node:path";
import { promisify as promisify2 } from "node:util";

// node_modules/usage-limits-core/src/usage-limits-core.ts
import { execFile } from "node:child_process";
import { chmod, mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var CACHE_FRESH_MS = 5 * 60 * 1000;
var CACHE_STALE_MS = 60 * 60 * 1000;
var API_TIMEOUT = 5000;
var MAX_429_BACKOFF_MS = 10 * 60 * 1000;
function parseRetryAfter(header, now, defaultMs) {
  if (!header)
    return now + defaultMs;
  const trimmed = header.trim();
  if (trimmed === "")
    return now + defaultMs;
  let candidate;
  if (/^[-+]?\d+$/.test(trimmed)) {
    const sec = parseInt(trimmed, 10);
    if (sec < 0)
      return now + defaultMs;
    candidate = now + sec * 1000;
  } else {
    const dateMs = Date.parse(trimmed);
    if (!isNaN(dateMs)) {
      candidate = Math.max(dateMs, now);
    } else {
      return now + defaultMs;
    }
  }
  return Math.max(candidate, now + 1000);
}
function parseCache(json) {
  try {
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || !("data" in parsed) || !("timestamp" in parsed) || typeof parsed.timestamp !== "number" || !Number.isFinite(parsed.timestamp)) {
      return null;
    }
    const nextRetryAt = typeof parsed.nextRetryAt === "number" && Number.isFinite(parsed.nextRetryAt) ? parsed.nextRetryAt : null;
    return {
      data: parsed.data,
      timestamp: parsed.timestamp,
      nextRetryAt
    };
  } catch {
    return null;
  }
}
function compute429Record(existing, retryAfterHeader, now, defaultMs) {
  const nextRetryAt = Math.min(parseRetryAfter(retryAfterHeader, now, defaultMs), now + MAX_429_BACKOFF_MS);
  if (existing === null) {
    return { data: null, timestamp: 0, nextRetryAt };
  }
  return { data: existing.data, timestamp: existing.timestamp, nextRetryAt };
}
function computeFailureRecord(existing, now, defaultMs, maxBackoffMs) {
  const nextRetryAt = Math.min(now + defaultMs, now + maxBackoffMs);
  if (existing === null)
    return { data: null, timestamp: 0, nextRetryAt };
  const staleTimestamp = existing.data === null ? existing.timestamp : Math.min(existing.timestamp, now - CACHE_FRESH_MS);
  return { data: existing.data, timestamp: staleTimestamp, nextRetryAt };
}
async function readRawRecordFile(cacheFile) {
  try {
    return parseCache(await readFile(cacheFile, "utf8"));
  } catch {
    return null;
  }
}
async function writeCacheRecord(cacheFile, record) {
  const dir = dirname(cacheFile);
  await mkdir(dir, { recursive: true, mode: 448 });
  try {
    await chmod(dir, 448);
  } catch {}
  await writeFile(cacheFile, JSON.stringify(record));
  await chmod(cacheFile, 384);
}
async function fetchAndCacheUsage(args) {
  const now = args.now ?? Date.now();
  const defaultBackoffMs = args.defaultBackoffMs ?? 60000;
  const maxBackoffMs = args.maxBackoffMs ?? MAX_429_BACKOFF_MS;
  const recordFailure = async (reason) => {
    console.warn(`usage-limits fetch failed: ${reason}`);
    const existing = await readRawRecordFile(args.cacheFile);
    await writeCacheRecord(args.cacheFile, computeFailureRecord(existing, now, defaultBackoffMs, maxBackoffMs));
  };
  if (!args.token) {
    await recordFailure("missing token");
    return;
  }
  const fetchImpl = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? API_TIMEOUT;
  let res;
  try {
    res = await fetchImpl(args.url, {
      headers: {
        ...args.headers,
        Authorization: `Bearer ${args.token}`
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    await recordFailure(error instanceof Error ? error.message : String(error));
    return;
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const existing = await readRawRecordFile(args.cacheFile);
    const record = compute429Record(existing, retryAfter, now, defaultBackoffMs);
    await writeCacheRecord(args.cacheFile, record);
    return;
  }
  if (!res.ok) {
    await recordFailure(`HTTP ${res.status}`);
    return;
  }
  try {
    const raw = await res.json();
    const data = args.normalize ? args.normalize(raw) : raw;
    await writeCacheRecord(args.cacheFile, { data, timestamp: now, nextRetryAt: null });
  } catch (error) {
    await recordFailure(error instanceof Error ? error.message : String(error));
  }
}
// scripts/limits-fetch.entry.ts
var execFileAsync2 = promisify2(execFile2);
var API_URL = "https://api.anthropic.com/api/oauth/usage";
var CACHE_FILE = join(homedir(), ".claude", "statusline-limits", "cache.json");
var CREDENTIALS_FILE = join(homedir(), ".claude", ".credentials.json");
var FETCH_LOCK_STALE_MS = 30 * 60 * 1000;
var FETCH_LOCK_RELEASE_SAFETY_MARGIN_MS = 60 * 1000;
function cacheFilePath() {
  return CACHE_FILE;
}
function tokenFromCredentialsJson(text) {
  const parsed = JSON.parse(text);
  return parsed?.claudeAiOauth?.accessToken || parsed?.claudeAiOauth?.access_token || parsed?.accessToken || parsed?.access_token || null;
}
async function tokenFromKeychain(execFileImpl = execFileAsync2) {
  try {
    const { stdout } = await execFileImpl("security", [
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-w"
    ]);
    const text = String(stdout).trim();
    if (!text)
      return null;
    try {
      return tokenFromCredentialsJson(text) ?? null;
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}
async function getToken({
  credentialsFile = CREDENTIALS_FILE,
  readFileImpl = readFile2,
  execFileImpl = execFileAsync2
} = {}) {
  try {
    const token = tokenFromCredentialsJson(await readFileImpl(credentialsFile, "utf8"));
    if (token)
      return token;
  } catch {}
  return tokenFromKeychain(execFileImpl);
}
async function readJsonFile(cacheFile, readFileImpl = readFile2) {
  try {
    return JSON.parse(await readFileImpl(cacheFile, "utf8"));
  } catch {
    return null;
  }
}
function successRecord(data, now = Date.now()) {
  return { timestamp: now, lastAttempt: now, consecutiveFailures: 0, lastError: null, data };
}
function failureRecord(existing, failure, now = Date.now()) {
  const previousFailures = Number(existing?.consecutiveFailures);
  const normalizedFailures = Number.isFinite(previousFailures) ? Math.max(0, Math.floor(previousFailures)) : 0;
  const consecutiveFailures = normalizedFailures + 1;
  return {
    timestamp: existing?.timestamp,
    lastAttempt: now,
    consecutiveFailures,
    lastError: { ...failure, at: now },
    data: existing?.data
  };
}
async function releaseOwnedFetchLock(lockDir, ownerToken, ops = { readFileSync, renameSync, rmSync, statSync }) {
  if (!lockDir || !ownerToken)
    return;
  try {
    const age = (ops.now ?? Date.now()) - ops.statSync(lockDir).mtimeMs;
    if (Number.isFinite(age) && age >= FETCH_LOCK_STALE_MS - FETCH_LOCK_RELEASE_SAFETY_MARGIN_MS) {
      return;
    }
  } catch {
    return;
  }
  try {
    if (ops.readFileSync(join(lockDir, "owner"), "utf8") !== ownerToken)
      return;
  } catch {
    return;
  }
  const tombstone = `${lockDir}.release.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  try {
    ops.renameSync(lockDir, tombstone);
  } catch {
    return;
  }
  let owned = false;
  try {
    owned = ops.readFileSync(join(tombstone, "owner"), "utf8") === ownerToken;
  } catch {}
  if (owned) {
    ops.rmSync(tombstone, { recursive: true, force: true });
    return;
  }
  try {
    ops.renameSync(tombstone, lockDir);
  } catch {}
}
async function writeCacheRecord2(record, cacheFile = CACHE_FILE, { mkdirImpl = mkdir2, writeFileImpl = writeFile2, renameImpl = rename } = {}) {
  const dir = dirname2(cacheFile);
  await mkdirImpl(dir, { recursive: true, mode: 448 });
  const tmp = join(dir, `.cache.${process.pid}.${Date.now()}.tmp`);
  await writeFileImpl(tmp, JSON.stringify(record), { mode: 384 });
  await renameImpl(tmp, cacheFile);
  try {
    await chmod2(dir, 448);
    await chmod2(cacheFile, 384);
  } catch {}
}
async function failureTypeFromResponse(response) {
  if (response.status === 429)
    return "rate_limit";
  if (response.status === 401)
    return "authentication_error";
  try {
    const body = await response.clone().json();
    if (body?.error?.type === "rate_limit_error" || body?.type === "rate_limit_error") {
      return "rate_limit";
    }
  } catch {}
  return "http_error";
}
function coreCacheFile(cacheFile) {
  const dir = dirname2(cacheFile);
  return join(dir, `.core-cache.${process.pid}.${Date.now()}.json`);
}
async function seedCoreCache(cacheFile, existing) {
  if (!existing || !existing.data || typeof existing.timestamp !== "number")
    return;
  await mkdir2(dirname2(cacheFile), { recursive: true, mode: 448 });
  await writeFile2(cacheFile, JSON.stringify({ data: existing.data, timestamp: existing.timestamp, nextRetryAt: null }), { mode: 384 });
}
async function fetchAndCacheLimits({
  cacheFile = CACHE_FILE,
  now = Date.now(),
  fetchImpl = globalThis.fetch,
  readFileImpl = readFile2,
  tokenProvider = getToken,
  writeCacheRecordImpl = writeCacheRecord2,
  rmImpl = rm,
  releaseFetchLockImpl = releaseOwnedFetchLock
} = {}) {
  const existing = await readJsonFile(cacheFile, readFileImpl);
  const tempCoreCache = coreCacheFile(cacheFile);
  let status;
  let failureError = "usage fetch failed";
  let failureType = "unknown";
  try {
    await seedCoreCache(tempCoreCache, existing);
    const token = await tokenProvider();
    if (!token) {
      failureError = "missing Claude credential";
      await writeCacheRecordImpl(failureRecord(existing, { type: "missing_credential" }, now), cacheFile);
      return { ok: false, error: failureError };
    }
    const fetchWithStatus = async (input, init) => {
      try {
        const response = await fetchImpl(input, init);
        status = response.status;
        if (!response.ok) {
          failureError = `usage API returned HTTP ${response.status}`;
          failureType = await failureTypeFromResponse(response);
        }
        return response;
      } catch (error) {
        failureError = error instanceof Error ? error.message : String(error);
        failureType = "network_error";
        throw error;
      }
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
      await fetchAndCacheUsage({
        cacheFile: tempCoreCache,
        token,
        url: API_URL,
        headers: {
          "Content-Type": "application/json",
          "anthropic-beta": "oauth-2025-04-20"
        },
        now,
        timeoutMs: 1e4,
        fetchImpl: fetchWithStatus
      });
    } finally {
      console.warn = warn;
    }
    const coreRecord = await readJsonFile(tempCoreCache);
    if (coreRecord?.timestamp === now && coreRecord?.nextRetryAt === null && coreRecord?.data) {
      await writeCacheRecordImpl(successRecord(coreRecord.data, now), cacheFile);
      return { ok: true, status };
    }
    await writeCacheRecordImpl(failureRecord(existing, { status, type: failureType }, now), cacheFile);
    return { ok: false, error: failureError };
  } finally {
    try {
      await rmImpl(tempCoreCache, { force: true });
    } finally {
      await releaseFetchLockImpl(process.env.STATUSLINE_LIMITS_FETCH_LOCK, process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN);
    }
  }
}
async function main() {
  const result = await fetchAndCacheLimits();
  if (!result.ok)
    process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
export {
  writeCacheRecord2 as writeCacheRecord,
  tokenFromKeychain,
  tokenFromCredentialsJson,
  successRecord,
  releaseOwnedFetchLock,
  main,
  getToken,
  fetchAndCacheLimits,
  failureRecord,
  cacheFilePath
};
