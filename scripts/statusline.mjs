#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const RESET = "\x1b[0m";
const COLORS = {
  gray: "\x1b[90m",
  white: "\x1b[97m",
  yellow: "\x1b[33m",
  orange: "\x1b[38;5;208m",
  red: "\x1b[91m",
};

const CACHE_MAX_AGE_MS = 2 * 60 * 1000;
const FETCH_MIN_INTERVAL_MS = 60 * 1000;

export function defaultInstallDir() {
  return join(homedir(), ".claude", "statusline-limits");
}

export function defaultCacheFile() {
  return join(defaultInstallDir(), "cache.json");
}

export function parseInput(text) {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function parseCache(text) {
  if (!text.trim()) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function readCache(cacheFile = defaultCacheFile(), now = Date.now()) {
  try {
    const record = parseCache(readFileSync(cacheFile, "utf8"));
    if (!record || !record.data) return null;
    return {
      data: record.data,
      stale:
        typeof record.timestamp === "number" ? now - record.timestamp > CACHE_MAX_AGE_MS : true,
    };
  } catch {
    return null;
  }
}

function color(text, name, options) {
  if (options.color === false) return text;
  return `${COLORS[name]}${text}${RESET}`;
}

function label(text, options) {
  return color(`${text}:`, "gray", options);
}

function percentColor(pct) {
  if (pct >= 90) return "red";
  if (pct >= 70) return "orange";
  if (pct >= 50) return "yellow";
  return "gray";
}

function gauge(pct, options) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const full = Math.floor(clamped / 20);
  const rem = clamped % 20;
  const partials = ["", "⣀", "⣤", "⣶", "⣿"];
  const partialIndex = Math.min(4, Math.floor(rem / 5));
  const cells = [];
  for (let i = 0; i < full; i += 1) cells.push("⣿");
  if (cells.length < 5 && partialIndex > 0) cells.push(partials[partialIndex]);
  while (cells.length < 5) cells.push("⣀");
  return color(cells.slice(0, 5).join(""), percentColor(clamped), options);
}

function pct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}

function formatK(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "?";
  return `${(number / 1000).toFixed(1)}K`;
}

function formatReset(epochSeconds, now = Date.now()) {
  const seconds = Number(epochSeconds);
  if (!Number.isFinite(seconds)) return "";
  const deltaMinutes = Math.max(0, Math.ceil((seconds * 1000 - now) / 60000));
  if (deltaMinutes < 60) return ` ${deltaMinutes}m`;
  const hours = Math.floor(deltaMinutes / 60);
  const minutes = deltaMinutes % 60;
  return minutes === 0 ? ` ${hours}h` : ` ${hours}h${minutes}m`;
}

function modelName(input) {
  return (
    input?.model?.display_name || input?.model?.id || input?.model?.name || input?.model || "Claude"
  );
}

function coreRateLimit(input, key) {
  const value = input?.rate_limits?.[key];
  if (!value || typeof value !== "object") return null;
  const used = pct(value.used_percentage);
  if (used === null) return null;
  return {
    label: key === "five_hour" ? "CC5" : "CCW",
    used,
    resetsAt: value.resets_at,
  };
}

function usagePercent(contextWindow) {
  const explicit = pct(contextWindow?.used_percentage);
  if (explicit !== null) return explicit;
  const used = Number(contextWindow?.used_tokens);
  const total = Number(contextWindow?.context_window_size);
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

function renderLimit(item, options) {
  const stale = item.stale ? "*" : "";
  const reset = item.resetsAt ? formatReset(item.resetsAt, options.now) : "";
  return `${label(item.label, options)}${gauge(item.used, options)} ${Math.round(item.used)}%${reset}${stale}`;
}

function cacheLimits(cache, now) {
  const limits = Array.isArray(cache?.limits) ? cache.limits : [];
  return limits
    .map((limit) => {
      const usage = limit?.usage || limit;
      const used = pct(usage?.used_percentage);
      if (used === null) return null;
      const bucket = String(limit?.bucket || limit?.type || "");
      const scopeType = String(limit?.scope?.type || "");
      const displayName =
        limit?.scope?.model?.display_name ||
        limit?.scope?.model?.name ||
        limit?.scope?.model?.id ||
        limit?.scope?.model ||
        limit?.label;
      let itemLabel = null;
      if (bucket === "five_hour" || limit?.name === "five_hour") itemLabel = "CC5";
      if (bucket === "seven_day" || limit?.name === "seven_day") itemLabel = "CCW";
      if (scopeType === "weekly_scoped" || bucket === "weekly_scoped") itemLabel = displayName;
      if (!itemLabel) return null;
      return {
        label: String(itemLabel),
        used,
        resetsAt: usage?.resets_at || limit?.resets_at,
        stale: Boolean(
          cache.stale || (cache.timestamp && now - cache.timestamp > CACHE_MAX_AGE_MS),
        ),
      };
    })
    .filter(Boolean);
}

export function renderStatusline(input, options = {}) {
  const renderOptions = {
    color: options.color ?? process.env.NO_COLOR === undefined,
    now: options.now ?? Date.now(),
  };
  const parts = [];
  const model = modelName(input);
  if (model) parts.push(color(String(model), "white", renderOptions));

  const context = input?.context_window || {};
  const used = usagePercent(context);
  if (used !== null) {
    const usedTokens = context?.used_tokens ?? context?.current_usage_tokens;
    const windowSize = context?.context_window_size;
    parts.push(
      `${label("TK", renderOptions)}${gauge(used, renderOptions)} ${Math.round(used)}% ${formatK(
        usedTokens,
      )}/${formatK(windowSize)}`,
    );
  }

  const cacheItems = cacheLimits(options.cache?.data, renderOptions.now).map((item) => ({
    ...item,
    stale: item.stale || Boolean(options.cache?.stale),
  }));
  const limits = cacheItems.length
    ? cacheItems
    : [coreRateLimit(input, "five_hour"), coreRateLimit(input, "seven_day")].filter(Boolean);
  for (const item of limits) parts.push(renderLimit(item, renderOptions));
  return parts.join(" ");
}

function shouldFetch(cacheFile, now = Date.now()) {
  try {
    const record = parseCache(readFileSync(cacheFile, "utf8"));
    if (!record) return true;
    const lastAttempt = Number(record.lastAttempt || record.timestamp || 0);
    return !Number.isFinite(lastAttempt) || now - lastAttempt > FETCH_MIN_INTERVAL_MS;
  } catch {
    return true;
  }
}

export function maybeSpawnLimitsFetch({
  scriptDir = dirname(fileURLToPath(import.meta.url)),
  cacheFile = defaultCacheFile(),
  now = Date.now(),
  spawnImpl = spawn,
  statImpl = statSync,
} = {}) {
  const fetcherPath = join(scriptDir, "limits-fetch.mjs");
  try {
    const stat = statImpl(fetcherPath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }
  if (!shouldFetch(cacheFile, now)) return false;
  const child = spawnImpl(process.execPath, [fetcherPath], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  if (child?.unref) child.unref();
  return true;
}

export async function main() {
  let stdin = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) stdin += chunk;
  maybeSpawnLimitsFetch();
  const input = parseInput(stdin);
  const cache = readCache();
  process.stdout.write(`${renderStatusline(input, { cache })}\n`);
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    process.stdout.write("\n");
  });
}
