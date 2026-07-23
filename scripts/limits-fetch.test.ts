import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  failureRecord,
  fetchAndCacheLimits,
  getToken,
  releaseOwnedFetchLock,
  successRecord,
  tokenFromCredentialsJson,
  tokenFromKeychain,
  writeCacheRecord,
} from "./limits-fetch.mjs";

describe("limits-fetch.mjs", () => {
  test("credentials json から token を読む", () => {
    expect(
      tokenFromCredentialsJson(JSON.stringify({ claudeAiOauth: { accessToken: "tok" } })),
    ).toBe("tok");
  });

  test("credentials json が無い場合は Keychain fallback を使う", async () => {
    const token = await getToken({
      credentialsFile: "/tmp/no-such-claude-credentials.json",
      readFileImpl: async () => {
        throw new Error("missing");
      },
      execFileImpl: async () => ({ stdout: "keychain-token\n" }),
    });
    expect(token).toBe("keychain-token");
  });

  test("Keychain stdout が credentials JSON の場合は accessToken を抽出する", async () => {
    const token = await tokenFromKeychain(async () => ({
      stdout: `${JSON.stringify({ claudeAiOauth: { accessToken: "x".repeat(20) } })}\n`,
    }));
    expect(token).toBe("x".repeat(20));
  });

  test("Keychain stdout が token 無しの valid JSON の場合は null を返す(JSON 全体を token 化しない)", async () => {
    const token = await tokenFromKeychain(async () => ({
      stdout: `${JSON.stringify({ foo: "bar" })}\n`,
    }));
    expect(token).toBeNull();
  });

  test("success record と failure record を生成する", () => {
    const data = { limits: [] };
    expect(successRecord(data, 123)).toEqual({
      timestamp: 123,
      lastAttempt: 123,
      consecutiveFailures: 0,
      lastError: null,
      data,
    });
    expect(
      failureRecord({ timestamp: 100, data, consecutiveFailures: 1 }, {
        status: 429,
        type: "rate_limit",
      }, 123),
    ).toEqual({
      timestamp: 100,
      lastAttempt: 123,
      consecutiveFailures: 2,
      lastError: { status: 429, type: "rate_limit", at: 123 },
      data,
    });
  });

  test("success record は失敗カウンタと lastError をリセットする", () => {
    expect(successRecord({ limits: [] }, 456)).toEqual({
      timestamp: 456,
      lastAttempt: 456,
      consecutiveFailures: 0,
      lastError: null,
      data: { limits: [] },
    });
  });

  test("failure record は破損した consecutiveFailures を非負整数に正規化する", () => {
    expect(failureRecord({ consecutiveFailures: -2 }, { type: "http_error" }, 100)).toMatchObject({
      consecutiveFailures: 1,
    });
    expect(failureRecord({ consecutiveFailures: 2.9 }, { type: "http_error" }, 100)).toMatchObject({
      consecutiveFailures: 3,
    });
    expect(failureRecord({ consecutiveFailures: Infinity }, { type: "http_error" }, 100)).toMatchObject({
      consecutiveFailures: 1,
    });
  });

  test("cache dir 0700 / file 0600 で書く", async () => {
    const dir = join(tmpdir(), `limits-fetch-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    try {
      await writeCacheRecord({ timestamp: 1, lastAttempt: 1, data: { limits: [] } }, file);
      const dirMode = (await stat(dir)).mode & 0o777;
      const fileMode = (await stat(file)).mode & 0o777;
      expect(dirMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("mock fetch 成功時に cache を書く", async () => {
    const dir = join(tmpdir(), `limits-fetch-ok-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    try {
      await mkdir(dir, { recursive: true });
      const result = await fetchAndCacheLimits({
        cacheFile: file,
        now: 456,
        tokenProvider: async () => "token",
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ limits: [{ bucket: "five_hour" }] }),
        }),
      });
      expect(result).toEqual({ ok: true, status: 200 });
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
        timestamp: 456,
        lastAttempt: 456,
        consecutiveFailures: 0,
        lastError: null,
        data: { limits: [{ bucket: "five_hour" }] },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("mock fetch 失敗時に既存 data を stale marker として残す", async () => {
    const dir = join(tmpdir(), `limits-fetch-fail-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    const data = { limits: [{ bucket: "seven_day" }] };
    try {
      await mkdir(dir, { recursive: true });
      await writeCacheRecord({ timestamp: 100, lastAttempt: 100, data }, file);
      const result = await fetchAndCacheLimits({
        cacheFile: file,
        now: 200,
        tokenProvider: async () => "token",
        fetchImpl: async () => ({ ok: false, status: 500 }),
      });
      expect(result.ok).toBe(false);
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
        timestamp: 100,
        lastAttempt: 200,
        consecutiveFailures: 1,
        lastError: { status: 500, type: "http_error", at: 200 },
        data,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("token が無い場合は fetch せず旧実装と同じ error を返す", async () => {
    const dir = join(tmpdir(), `limits-fetch-missing-token-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    try {
      await mkdir(dir, { recursive: true });
      const result = await fetchAndCacheLimits({
        cacheFile: file,
        now: 300,
        tokenProvider: async () => null,
        fetchImpl: async () => {
          throw new Error("fetch should not be called");
        },
      });
      expect(result).toEqual({ ok: false, error: "missing Claude credential" });
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
        lastAttempt: 300,
        consecutiveFailures: 1,
        lastError: { type: "missing_credential", at: 300 },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("HTTP 失敗時は旧実装と同じ status 付き error を返す", async () => {
    const dir = join(tmpdir(), `limits-fetch-http-fail-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    try {
      await mkdir(dir, { recursive: true });
      const result = await fetchAndCacheLimits({
        cacheFile: file,
        now: 400,
        tokenProvider: async () => "token",
        fetchImpl: async () => ({ ok: false, status: 503 }),
      });
      expect(result).toEqual({ ok: false, error: "usage API returned HTTP 503" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("429 HTTP 失敗時は rate_limit error として記録する", async () => {
    const dir = join(tmpdir(), `limits-fetch-rate-limit-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    const data = { limits: [{ bucket: "five_hour" }] };
    try {
      await mkdir(dir, { recursive: true });
      await writeCacheRecord({ timestamp: 100, lastAttempt: 100, data }, file);
      const result = await fetchAndCacheLimits({
        cacheFile: file,
        now: 600,
        tokenProvider: async () => "token",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { type: "rate_limit_error" } }), { status: 429 }),
      });
      expect(result).toEqual({ ok: false, error: "usage API returned HTTP 429" });
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
        timestamp: 100,
        lastAttempt: 600,
        consecutiveFailures: 1,
        lastError: { status: 429, type: "rate_limit", at: 600 },
        data,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rate_limit_error body は status 429 以外でも rate_limit として記録する", async () => {
    const dir = join(tmpdir(), `limits-fetch-rate-limit-body-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    try {
      await mkdir(dir, { recursive: true });
      const result = await fetchAndCacheLimits({
        cacheFile: file,
        now: 700,
        tokenProvider: async () => "token",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { type: "rate_limit_error" } }), { status: 400 }),
      });
      expect(result).toEqual({ ok: false, error: "usage API returned HTTP 400" });
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
        lastAttempt: 700,
        consecutiveFailures: 1,
        lastError: { status: 400, type: "rate_limit", at: 700 },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("401 HTTP 失敗時は authentication_error として記録する", async () => {
    const dir = join(tmpdir(), `limits-fetch-auth-fail-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    try {
      await mkdir(dir, { recursive: true });
      const result = await fetchAndCacheLimits({
        cacheFile: file,
        now: 750,
        tokenProvider: async () => "token",
        fetchImpl: async () => new Response(JSON.stringify({ error: { type: "auth" } }), { status: 401 }),
      });
      expect(result).toEqual({ ok: false, error: "usage API returned HTTP 401" });
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
        lastAttempt: 750,
        consecutiveFailures: 1,
        lastError: { status: 401, type: "authentication_error", at: 750 },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("fetcher は statusline から渡された lock を終了時に解放する", async () => {
    const dir = join(tmpdir(), `limits-fetch-lock-release-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    const lockDir = join(dir, ".fetch.lock");
    const previousLock = process.env.STATUSLINE_LIMITS_FETCH_LOCK;
    const previousToken = process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN;
    try {
      await mkdir(lockDir, { recursive: true });
      await writeFile(join(lockDir, "owner"), "token-a");
      process.env.STATUSLINE_LIMITS_FETCH_LOCK = lockDir;
      process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN = "token-a";
      await fetchAndCacheLimits({
        cacheFile: file,
        now: 800,
        tokenProvider: async () => null,
      });
      await expect(stat(lockDir)).rejects.toThrow();
    } finally {
      if (previousLock === undefined) {
        delete process.env.STATUSLINE_LIMITS_FETCH_LOCK;
      } else {
        process.env.STATUSLINE_LIMITS_FETCH_LOCK = previousLock;
      }
      if (previousToken === undefined) {
        delete process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN;
      } else {
        process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN = previousToken;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("fetcher は owner token が一致しない lock を削除しない", async () => {
    const dir = join(tmpdir(), `limits-fetch-lock-owner-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    const lockDir = join(dir, ".fetch.lock");
    const previousLock = process.env.STATUSLINE_LIMITS_FETCH_LOCK;
    const previousToken = process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN;
    try {
      await mkdir(lockDir, { recursive: true });
      await writeFile(join(lockDir, "owner"), "new-owner");
      process.env.STATUSLINE_LIMITS_FETCH_LOCK = lockDir;
      process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN = "old-owner";
      await fetchAndCacheLimits({
        cacheFile: file,
        now: 850,
        tokenProvider: async () => null,
      });
      expect(await readFile(join(lockDir, "owner"), "utf8")).toBe("new-owner");
    } finally {
      if (previousLock === undefined) {
        delete process.env.STATUSLINE_LIMITS_FETCH_LOCK;
      } else {
        process.env.STATUSLINE_LIMITS_FETCH_LOCK = previousLock;
      }
      if (previousToken === undefined) {
        delete process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN;
      } else {
        process.env.STATUSLINE_LIMITS_FETCH_LOCK_TOKEN = previousToken;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("stale 域の release は canonical lock に触らない", async () => {
    const dir = join(tmpdir(), `limits-fetch-release-stale-${process.pid}-${Date.now()}`);
    const lockDir = join(dir, ".fetch.lock");
    const now = 2000000000000;
    let renamed = false;
    try {
      await mkdir(lockDir, { recursive: true });
      await writeFile(join(lockDir, "owner"), "old-owner");

      await releaseOwnedFetchLock(lockDir, "old-owner", {
        now,
        statSync() {
          return { mtimeMs: now - (30 * 60 * 1000 - 60 * 1000) };
        },
        renameSync() {
          renamed = true;
          throw new Error("release should not rename stale-region lock");
        },
        readFileSync,
        rmSync,
      });

      expect(renamed).toBe(false);
      expect(await readFile(join(lockDir, "owner"), "utf8")).toBe("old-owner");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("若い lock でも owner が違う release は canonical lock に触らない", async () => {
    const dir = join(tmpdir(), `limits-fetch-release-other-owner-${process.pid}-${Date.now()}`);
    const lockDir = join(dir, ".fetch.lock");
    const now = 2000000000000;
    let renamed = false;
    try {
      await mkdir(lockDir, { recursive: true });
      await writeFile(join(lockDir, "owner"), "owner-b");

      await releaseOwnedFetchLock(lockDir, "owner-a", {
        now,
        statSync() {
          return { mtimeMs: now - 1000 };
        },
        renameSync() {
          renamed = true;
          throw new Error("release should not rename another owner's lock");
        },
        readFileSync,
        rmSync,
      });

      expect(renamed).toBe(false);
      expect(await readFile(join(lockDir, "owner"), "utf8")).toBe("owner-b");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("release 中に stale takeover が挟まっても新 lock を削除しない", async () => {
    const dir = join(tmpdir(), `limits-fetch-release-race-${process.pid}-${Date.now()}`);
    const lockDir = join(dir, ".fetch.lock");
    try {
      await mkdir(lockDir, { recursive: true });
      await writeFile(join(lockDir, "owner"), "old-owner");

      await releaseOwnedFetchLock(lockDir, "old-owner", {
        renameSync(from: string, to: string) {
          renameSync(from, to);
          mkdirSync(lockDir);
          writeFileSync(join(lockDir, "owner"), "new-owner");
        },
        readFileSync,
        statSync,
        rmSync,
      });

      expect(await readFile(join(lockDir, "owner"), "utf8")).toBe("new-owner");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("temp core cache の rm が失敗しても lock release を実行する", async () => {
    let released = false;
    await expect(
      fetchAndCacheLimits({
        cacheFile: "/tmp/statusline-release-on-rm-fail/cache.json",
        now: 900,
        tokenProvider: async () => null,
        rmImpl: async () => {
          throw new Error("rm failed");
        },
        releaseFetchLockImpl: async () => {
          released = true;
        },
      }),
    ).rejects.toThrow("rm failed");
    expect(released).toBe(true);
  });

  test("fetch 例外時は旧実装と同じ例外 message を返す", async () => {
    const dir = join(tmpdir(), `limits-fetch-network-fail-${process.pid}-${Date.now()}`);
    const file = join(dir, "cache.json");
    try {
      await mkdir(dir, { recursive: true });
      const result = await fetchAndCacheLimits({
        cacheFile: file,
        now: 500,
        tokenProvider: async () => "token",
        fetchImpl: async () => {
          throw new Error("network down");
        },
      });
      expect(result).toEqual({ ok: false, error: "network down" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
