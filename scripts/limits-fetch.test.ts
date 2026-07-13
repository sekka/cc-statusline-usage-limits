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

  test("success record と failure record を生成する", () => {
    const data = { limits: [] };
    expect(successRecord(data, 123)).toEqual({ timestamp: 123, lastAttempt: 123, data });
    expect(failureRecord({ timestamp: 100, data }, 123)).toEqual({
      timestamp: 100,
      lastAttempt: 123,
      data,
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
        data,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
