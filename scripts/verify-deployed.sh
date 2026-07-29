#!/bin/sh
set -eu

cache_root="${STATUSLINE_PLUGIN_CACHE_ROOT:-${HOME}/.claude/plugins/cache/cc-statusline-usage-limits/statusline-limits}"
deployed_statusline="${STATUSLINE_DEPLOYED_PATH:-${HOME}/.claude/statusline-limits/statusline.mjs}"
failures=0

pass() {
  printf 'PASS %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1"
  failures=$((failures + 1))
}

latest_plugin_statusline() {
  node - "$cache_root" <<'NODE'
const fs = require("fs");
const path = require("path");

const root = process.argv[2];

function parseSemver(version) {
  const match = /^v?([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;
  return {
    version,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifier(left, right) {
  const leftNumber = /^[0-9]+$/.test(left);
  const rightNumber = /^[0-9]+$/.test(right);
  if (leftNumber && rightNumber) return Number(left) - Number(right);
  if (leftNumber) return -1;
  if (rightNumber) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSemver(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const compared = compareIdentifier(left.prerelease[index], right.prerelease[index]);
    if (compared !== 0) return compared;
  }
  return 0;
}

let entries;
try {
  entries = fs.readdirSync(root, { withFileTypes: true });
} catch (error) {
  console.error(`cannot read plugin cache root: ${root}`);
  process.exit(2);
}

const versions = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => parseSemver(entry.name))
  .filter(Boolean)
  .sort(compareSemver);

if (versions.length === 0) {
  console.error(`no semver version directories under: ${root}`);
  process.exit(2);
}

const latest = versions[versions.length - 1].version;
process.stdout.write(path.join(root, latest, "scripts", "statusline.mjs"));
NODE
}

latest_statusline="$(latest_plugin_statusline)"

printf 'target=%s\n' "$deployed_statusline"
printf 'latest_plugin=%s\n' "$latest_statusline"

if [ -f "$deployed_statusline" ] && [ -f "$latest_statusline" ] && cmp -s "$deployed_statusline" "$latest_statusline"; then
  pass "deployed statusline byte-matches latest plugin cache"
else
  fail "deployed statusline byte-matches latest plugin cache"
fi

if [ -f "$deployed_statusline" ] && grep -q 'mergeLimitItems' "$deployed_statusline"; then
  pass "deployed statusline contains mergeLimitItems"
else
  fail "deployed statusline contains mergeLimitItems"
fi

tmp_home="$(mktemp -d "${TMPDIR:-/tmp}/verify-deployed-home.XXXXXX")"
cleanup() {
  rm -rf "$tmp_home"
}
trap cleanup EXIT HUP INT TERM

status_dir="$tmp_home/.claude/statusline-limits"
mkdir -p "$status_dir"

now_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
stale_timestamp=$((now_ms - 10 * 60 * 1000))

node - "$status_dir/cache.json" "$stale_timestamp" "$now_ms" <<'NODE'
const fs = require("fs");
const [cacheFile, timestamp, lastAttempt] = process.argv.slice(2);
fs.writeFileSync(
  cacheFile,
  JSON.stringify({
    timestamp: Number(timestamp),
    lastAttempt: Number(lastAttempt),
    data: {
      five_hour: { percent: 13, resets_at: "2033-05-18T04:33:20.000Z" },
      seven_day: { percent: 87, resets_at: "2033-05-18T22:13:20.000Z" },
    },
  }),
);
NODE

stdin_payload='{"model":{"display_name":"VerifyModel"},"rate_limits":{"five_hour":{"used_percentage":61,"resets_at":2000003600},"seven_day":{"used_percentage":22,"resets_at":2000067200}}}'
if [ -f "$deployed_statusline" ]; then
  set +e
  behavior_output="$(
    printf '%s\n' "$stdin_payload" |
      HOME="$tmp_home" NO_COLOR=1 node "$deployed_statusline" 2>&1
  )"
  behavior_status=$?
  set -e
else
  behavior_output="target not found"
  behavior_status=127
fi

printf 'behavior_exit=%s\n' "$behavior_status"
printf 'behavior_output=%s\n' "$behavior_output"

if [ "$behavior_status" -eq 0 ] &&
  printf '%s\n' "$behavior_output" | grep -q 'CC5:.* 61%' &&
  printf '%s\n' "$behavior_output" | grep -q 'CCW:.* 22%' &&
  ! printf '%s\n' "$behavior_output" | grep -q ' 13%' &&
  ! printf '%s\n' "$behavior_output" | grep -q ' 87%' &&
  ! printf '%s\n' "$behavior_output" | grep -q '?' &&
  ! printf '%s\n' "$behavior_output" | grep -q 'm ago)'; then
  pass "stdin rate_limits override stale cache by window"
else
  fail "stdin rate_limits override stale cache by window"
fi

if [ "$failures" -eq 0 ]; then
  exit 0
fi

exit 1
