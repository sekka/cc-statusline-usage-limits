# statusline-limits

Claude Code statusline gauges for token usage and rate limits.

Core mode is the default. It reads only the JSON Claude Code passes to the statusline command on stdin, writes one statusline to stdout, and does not read credentials or perform network access.

Extended mode is opt-in. It is enabled only when `limits-fetch.mjs` is copied next to the stable `statusline.mjs` under `$HOME/.claude/statusline-limits/`.

Before enabling Extended mode, note the data access: **it reads `$HOME/.claude/.credentials.json`, falls back to the macOS Keychain item `Claude Code-credentials`, and sends the bearer token to the undocumented `https://api.anthropic.com/api/oauth/usage` endpoint.**

## Install

```text
/plugin marketplace add sekka/cc-statusline-usage-limits
/plugin install statusline-limits@cc-statusline-usage-limits
/statusline-limits:install
```

The install skill copies `statusline.mjs` to:

```text
$HOME/.claude/statusline-limits/statusline.mjs
```

and configures Claude Code with:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node $HOME/.claude/statusline-limits/statusline.mjs",
    "refreshInterval": 30
  }
}
```

The SessionStart hook syncs only the Core `statusline.mjs` script from the plugin cache to the stable path. The hook copies through a temporary file and then renames it so statusline executions do not read a partially written script.

If install replaces an existing `statusLine`, the install skill stores the previous value at `$HOME/.claude/statusline-limits/prev-statusline.json` so uninstall can restore it.

## Extended Mode

Extended mode adds model-scoped weekly limits from Anthropic's OAuth usage endpoint. It is off until you approve copying `limits-fetch.mjs` to the stable runtime directory.

Before enabling Extended mode, note the data access:

- **It reads `$HOME/.claude/.credentials.json`.**
- **If the file does not contain a token, it asks macOS Keychain for `Claude Code-credentials`.**
- **It sends the bearer token to `https://api.anthropic.com/api/oauth/usage`.**
- It writes cached usage data to `$HOME/.claude/statusline-limits/cache.json`.

**The endpoint and beta header are undocumented and may change, fail, or return a different schema.** The fetcher never prints the token. Cache directories are written as `0700`; cache files are written as `0600`.

Extended `limits-fetch.mjs` is not auto-synced by the hook because it reads credentials. To update Extended mode, rerun `/statusline-limits:install`, review the disclosure, and approve copying the new fetcher.

## Uninstall

Run:

```text
/statusline-limits:uninstall
```

Disabling the plugin is not the same as uninstalling this statusline. Claude Code can continue running the stable copied script from `$HOME/.claude/statusline-limits/statusline.mjs` until the settings entry and copied runtime are removed.

If install replaced a previous `statusLine`, uninstall restores the saved `$HOME/.claude/statusline-limits/prev-statusline.json` snapshot before removing the runtime directory. If no snapshot exists, uninstall removes the plugin `statusLine` entry.

## Release

When releasing a new plugin version, bump `.claude-plugin/plugin.json` `version`. The marketplace manifest does not pin with a `ref` field.

## Development

```sh
bun test scripts/*.test.ts
echo '{"model":{"display_name":"Claude"},"context_window":{"used_percentage":10,"used_tokens":10000,"context_window_size":100000}}' | node scripts/statusline.mjs
```
