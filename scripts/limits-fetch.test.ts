import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  failureRecord,
  fetchAndCacheLimits,
  getToken,
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
      failureRecord({ timestamp: 100, data, consecutiveFailures: 1 }, 123, {
        status: 429,
        type: "rate_limit",
      }),
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
    try {
      await mkdir(lockDir, { recursive: true });
      process.env.STATUSLINE_LIMITS_FETCH_LOCK = lockDir;
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
      await rm(dir, { recursive: true, force: true });
    }
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
