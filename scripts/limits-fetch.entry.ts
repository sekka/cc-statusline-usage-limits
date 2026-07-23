import { execFile } from "node:child_process";
import { readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fetchAndCacheUsage } from "usage-limits-core";

const execFileAsync = promisify(execFile);
const API_URL = "https://api.anthropic.com/api/oauth/usage";
const CACHE_FILE = join(homedir(), ".claude", "statusline-limits", "cache.json");
const CREDENTIALS_FILE = join(homedir(), ".claude", ".credentials.json");
const FETCH_LOCK_STALE_MS = 30 * 60 * 1000;
const FETCH_LOCK_RELEASE_SAFETY_MARGIN_MS = 60 * 1000;

export function cacheFilePath() {
  return CACHE_FILE;
}

export function tokenFromCredentialsJson(text: string) {
  const parsed = JSON.parse(text);
  return (
    parsed?.claudeAiOauth?.accessToken ||
    parsed?.claudeAiOauth?.access_token ||
    parsed?.accessToken ||
    parsed?.access_token ||
    null
  );
}

export async function tokenFromKeychain(execFileImpl = execFileAsync) {
  try {
    const { stdout } = await execFileImpl("security", [
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-w",
    ]);
    const text = String(stdout).trim();
    if (!text) return null;
    try {
      return tokenFromCredentialsJson(text) ?? null;
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

export async function getToken({
  credentialsFile = CREDENTIALS_FILE,
  readFileImpl = readFile,
  execFileImpl = execFileAsync,
} = {}) {
  try {
    const token = tokenFromCredentialsJson(await readFileImpl(credentialsFile, "utf8"));
    if (token) return token;
  } catch {}
  return tokenFromKeychain(execFileImpl);
}

async function readJsonFile(cacheFile: string, readFileImpl: typeof readFile = readFile) {
  try {
    return JSON.parse(await readFileImpl(cacheFile, "utf8"));
  } catch {
    return null;
  }
}

export function successRecord(data: unknown, now = Date.now()) {
  return { timestamp: now, lastAttempt: now, consecutiveFailures: 0, lastError: null, data };
}

type FailureInfo = {
  status?: number;
  type: string;
};

export function failureRecord(existing: any, failure: FailureInfo, now = Date.now()) {
  const previousFailures = Number(existing?.consecutiveFailures);
  const normalizedFailures = Number.isFinite(previousFailures)
    ? Math.max(0, Math.floor(previousFailures))
    : 0;
  const consecutiveFailures = normalizedFailures + 1;
  return {
    timestamp: existing?.timestamp,
    lastAttempt: now,
    consecutiveFailures,
    lastError: { ...failure, at: now },
    data: existing?.data,
  };
}

type ReleaseLockOps = {
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  rmSync: typeof rmSync;
  statSync: typeof statSync;
  now?: number;
};

export async function releaseOwnedFetchLock(
  lockDir: string | undefined,
  ownerToken: string | undefined,
  ops: ReleaseLockOps = { readFileSync, renameSync, rmSync, statSync },
) {
  if (!lockDir || !ownerToken) return;
  try {
    const age = (ops.now ?? Date.now()) - ops.statSync(lockDir).mtimeMs;
    if (Number.isFinite(age) && age >= FETCH_LOCK_STALE_MS - FETCH_LOCK_RELEASE_SAFETY_MARGIN_MS) {
      return;
    }
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

export async function writeCacheRecord(
  record: unknown,
  cacheFile = CACHE_FILE,
  { mkdirImpl = mkdir, writeFileImpl = writeFile, renameImpl = rename } = {},
) {
  const dir = dirname(cacheFile);
  await mkdirImpl(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, `.cache.${process.pid}.${Date.now()}.tmp`);
  await writeFileImpl(tmp, JSON.stringify(record), { mode: 0o600 });
  await renameImpl(tmp, cacheFile);
  try {
    await chmod(dir, 0o700);
    await chmod(cacheFile, 0o600);
  } catch {}
}

async function failureTypeFromResponse(response: Response) {
  if (response.status === 429) return "rate_limit";
  if (response.status === 401) return "authentication_error";
  try {
    const body = await response.clone().json();
    if (body?.error?.type === "rate_limit_error" || body?.type === "rate_limit_error") {
      return "rate_limit";
    }
  } catch {}
  return "http_error";
}

function coreCacheFile(cacheFile: string) {
  const dir = dirname(cacheFile);
  return join(dir, `.core-cache.${process.pid}.${Date.now()}.json`);
}

async function seedCoreCache(cacheFile: string, existing: any) {
  if (!existing || !existing.data || typeof existing.timestamp !== "number") return;
  await mkdir(dirname(cacheFile), { recursive: true, mode: 0o700 });
  await writeFile(
    cacheFile,
    JSON.stringify({ data: existing.data, timestamp: existing.timestamp, nextRetryAt: null }),
    { mode: 0o600 },
  );
}

export async function fetchAndCacheLimits({
  cacheFile = CACHE_FILE,
  now = Date.now(),
  fetchImpl = globalThis.fetch,
  readFileImpl = readFile,
  tokenProvider = getToken,
  writeCacheRecordImpl = writeCacheRecord,
  rmImpl = rm,
  releaseFetchLockImpl = releaseOwnedFetchLock,
} = {}) {
  const existing = await readJsonFile(cacheFile, readFileImpl);
  const tempCoreCache = coreCacheFile(cacheFile);
  let status: number | undefined;
  let failureError = "usage fetch failed";
  let failureType = "unknown";

  try {
    await seedCoreCache(tempCoreCache, existing);
    const token = await tokenProvider();
    if (!token) {
      failureError = "missing Claude credential";
      await writeCacheRecordImpl(
        failureRecord(existing, { type: "missing_credential" }, now),
        cacheFile,
      );
      return { ok: false, error: failureError };
    }
    const fetchWithStatus: typeof fetch = async (input, init) => {
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
          "anthropic-beta": "oauth-2025-04-20",
        },
        now,
        timeoutMs: 10_000,
        fetchImpl: fetchWithStatus,
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
      await releaseFetchLockImpl(
        process.env.STATUSLINE_LIMITS_FETCH_LOCK,
        process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN,
      );
    }
  }
}

export async function main() {
  const result = await fetchAndCacheLimits();
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
