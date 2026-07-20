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

const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const FETCH_MIN_INTERVAL_MS = 60 * 1000;
const TOKYO_TZ = "Asia/Tokyo";

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
      timestamp: typeof record.timestamp === "number" ? record.timestamp : undefined,
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
  if (pct > 90) return "red";
  if (pct > 70) return "orange";
  if (pct > 50) return "yellow";
  return "white";
}

function gauge(pct, options) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const len = 5;
  const chars = ["⣀", "⣄", "⣤", "⣦", "⣶", "⣷", "⣿"];
  const steps = len * (chars.length - 1);
  const cur = Math.round((clamped / 100) * steps);
  const full = Math.floor(cur / (chars.length - 1));
  const partial = cur % (chars.length - 1);
  const empty = len - full - (partial > 0 ? 1 : 0);
  const bar = "⣿".repeat(full) + (partial > 0 ? chars[partial] : "") + "⣀".repeat(empty);
  return color(bar, percentColor(clamped), options);
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

function resetMsFrom(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : new Date(value).getTime();
}

function resetTime(value, now = Date.now()) {
  const resetMs = resetMsFrom(value);
  if (!Number.isFinite(resetMs)) return "";
  const diff = resetMs - now;
  if (diff <= 0) return "now";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d${hours % 24}h`;
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

function resetDate(value, now = Date.now()) {
  const resetMs = resetMsFrom(value);
  if (!Number.isFinite(resetMs)) return "";
  const reset = new Date(resetMs);
  const current = new Date(now);
  const time = reset.toLocaleString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TOKYO_TZ,
    hour12: false,
  });
  const resetDateString = reset.toLocaleDateString("ja-JP", { timeZone: TOKYO_TZ });
  const currentDateString = current.toLocaleDateString("ja-JP", { timeZone: TOKYO_TZ });
  if (resetDateString === currentDateString) return time;
  const month = reset
    .toLocaleDateString("ja-JP", { month: "numeric", timeZone: TOKYO_TZ })
    .replace(/月/g, "");
  const day = reset
    .toLocaleDateString("ja-JP", { day: "numeric", timeZone: TOKYO_TZ })
    .replace(/日/g, "");
  return `${month}/${day} ${time}`;
}

function formatReset(value, now = Date.now()) {
  const absolute = resetDate(value, now);
  const relative = resetTime(value, now);
  return absolute && relative ? ` (${absolute}|${relative})` : "";
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
  const stale = item.stale ? "?" : "";
  const reset = item.resetsAt ? formatReset(item.resetsAt, options.now).trim() : "";
  const resetDisplay = reset ? ` ${color(reset, "gray", options)}` : "";
  return `${label(`${item.label}${stale}`, options)}${gauge(item.used, options)} ${color(
    String(Math.round(item.used)),
    "white",
    options,
  )}${color("%", "gray", options)}${resetDisplay}`;
}

function limitPercent(...values) {
  for (const value of values) {
    const used = pct(value);
    if (used !== null) return used;
  }
  return null;
}

function itemFromLimit(labelText, value, cache, now) {
  if (!value || typeof value !== "object") return null;
  const usage = value?.usage || value;
  const used = limitPercent(usage?.percent, usage?.utilization, usage?.used_percentage);
  if (used === null) return null;
  return {
    label: labelText,
    used,
    resetsAt: usage?.resets_at || value?.resets_at,
    stale: Boolean(cache.stale || (cache.timestamp && now - cache.timestamp > CACHE_MAX_AGE_MS)),
  };
}

function cacheLimits(cache, now) {
  const items = [
    itemFromLimit("CC5", cache?.five_hour, cache ?? {}, now),
    itemFromLimit("CCW", cache?.seven_day, cache ?? {}, now),
  ].filter(Boolean);

  const limits = Array.isArray(cache?.limits) ? cache.limits : [];
  for (const limit of limits) {
    const bucket = String(limit?.bucket || limit?.type || "");
    const scopeType = String(limit?.scope?.type || "");
    let itemLabel = null;
    if (bucket === "five_hour" || limit?.name === "five_hour") itemLabel = "CC5";
    if (bucket === "seven_day" || limit?.name === "seven_day") itemLabel = "CCW";
    if (
      limit?.kind === "weekly_scoped" ||
      scopeType === "weekly_scoped" ||
      bucket === "weekly_scoped"
    ) {
      itemLabel = limit?.scope?.model?.display_name === "Fable" ? "CCF" : null;
    }
    if (!itemLabel) continue;
    const item = itemFromLimit(String(itemLabel), limit, cache ?? {}, now);
    if (item) items.push(item);
  }
  return items;
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
    stale:
      item.stale ||
      Boolean(options.cache?.stale) ||
      (typeof options.cache?.timestamp === "number" &&
        renderOptions.now - options.cache.timestamp > CACHE_MAX_AGE_MS),
  }));
  const limits = cacheItems.length
    ? cacheItems
    : [coreRateLimit(input, "five_hour"), coreRateLimit(input, "seven_day")].filter(Boolean);
  for (const item of limits) parts.push(renderLimit(item, renderOptions));
  if (
    cacheItems.length > 0 &&
    (options.cache?.stale ||
      (typeof options.cache?.timestamp === "number" &&
        renderOptions.now - options.cache.timestamp > CACHE_MAX_AGE_MS)) &&
    typeof options.cache?.timestamp === "number"
  ) {
    parts.push(
      color(
        `(${Math.floor((renderOptions.now - options.cache.timestamp) / 60000)}m ago)`,
        "gray",
        renderOptions,
      ),
    );
  }
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
