#!/usr/bin/env node
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);
const API_URL = "https://api.anthropic.com/api/oauth/usage";
const CACHE_FILE = join(homedir(), ".claude", "statusline-limits", "cache.json");
const CREDENTIALS_FILE = join(homedir(), ".claude", ".credentials.json");

export function cacheFilePath() {
  return CACHE_FILE;
}

export function tokenFromCredentialsJson(text) {
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
      const token = tokenFromCredentialsJson(text);
      if (token) return token;
    } catch {}
    return text;
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

async function readExisting(cacheFile, readFileImpl) {
  try {
    return JSON.parse(await readFileImpl(cacheFile, "utf8"));
  } catch {
    return null;
  }
}

export function successRecord(data, now = Date.now()) {
  return { timestamp: now, lastAttempt: now, data };
}

export function failureRecord(existing, now = Date.now()) {
  return { timestamp: existing?.timestamp, lastAttempt: now, data: existing?.data };
}

export async function writeCacheRecord(
  record,
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

export async function fetchAndCacheLimits({
  cacheFile = CACHE_FILE,
  now = Date.now(),
  fetchImpl = globalThis.fetch,
  readFileImpl = readFile,
  tokenProvider = getToken,
  writeCacheRecordImpl = writeCacheRecord,
} = {}) {
  const existing = await readExisting(cacheFile, readFileImpl);
  try {
    const token = await tokenProvider();
    if (!token) throw new Error("missing Claude credential");
    const res = await fetchImpl(API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`usage API returned HTTP ${res.status}`);
    const data = await res.json();
    const record = successRecord(data, now);
    await writeCacheRecordImpl(record, cacheFile);
    return { ok: true, status: res.status };
  } catch (error) {
    await writeCacheRecordImpl(failureRecord(existing, now), cacheFile);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
