# cc-statusline-usage-limits

Claude Code statusline gauges for token usage and rate limits.

Example output:

```text
Claude TK:⣦⣀⣀⣀⣀ 10% 10.0K/100.0K CC5:⣿⣿⣿⣀⣀ 61% (20:54|1h0m) CCW:⣿⣄⣀⣀⣀ 22% (7/14 14:34|18h40m) CCF:⣿⣿⣿⣦⣀ 71% (7/14 01:06|5h12m)
```

Gauge = utilization. `TK` is context-window token usage, `(reset time|time remaining)` shows the reset point and remaining time, and `?` marks stale cache.

## Features

- Renders token usage from Claude Code statusline stdin in Core mode.
- Keeps Core mode credential-free and network-free.
- Offers opt-in Extended mode for model-scoped weekly limits.
- Syncs the stable Core runtime script through a SessionStart hook.

## Requirements

- Claude Code with plugin support
- Node.js for the installed statusline runtime
- [bun](https://bun.sh) for development and tests
- macOS Keychain only if Extended mode falls back to Keychain credentials

## Install

Install from the Claude Code plugin marketplace:

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

## Usage

Core mode is the default. It reads only the JSON Claude Code passes to the statusline command on stdin, writes one statusline to stdout, and does not read credentials or perform network access.

Extended mode adds model-scoped weekly limits from Anthropic's OAuth usage endpoint. It is enabled only when `limits-fetch.mjs` is copied next to the stable `statusline.mjs` under `$HOME/.claude/statusline-limits/`.

Extended `limits-fetch.mjs` is not auto-synced by the hook because it reads credentials. To update Extended mode, rerun `/statusline-limits:install`, review the disclosure, and approve copying the new fetcher.

## Configuration

The installed `statusLine` command is:

```text
node $HOME/.claude/statusline-limits/statusline.mjs
```

The default refresh interval is `30` seconds. The stable runtime directory is `$HOME/.claude/statusline-limits/`.

If install replaces an existing `statusLine`, the install skill stores the previous value at `$HOME/.claude/statusline-limits/prev-statusline.json` so uninstall can restore it.

## Security disclosure

- **Core mode reads only Claude Code statusline stdin and does not read credentials or perform network access.**
- **Extended mode reads `$HOME/.claude/.credentials.json`.**
- **If the file does not contain a token, Extended mode asks macOS Keychain for `Claude Code-credentials`.**
- **Extended mode sends the bearer token to `https://api.anthropic.com/api/oauth/usage`.**
- **The endpoint and beta header are undocumented and may change, fail, or return a different schema.**
- **Disabling the plugin is not the same as uninstalling this statusline; Claude Code can continue running the stable copied script until the settings entry and copied runtime are removed.**

The fetcher never prints the token. Cache directories are written as `0700`; cache files are written as `0600`.

## How it works

The SessionStart hook syncs only the Core `statusline.mjs` script from the plugin cache to the stable path. The hook copies through a temporary file and then renames it so statusline executions do not read a partially written script.

In Extended mode, `limits-fetch.mjs` refreshes cached usage data in `$HOME/.claude/statusline-limits/cache.json`. `statusline.mjs` renders cached limit data when present and falls back to Core stdin-only output when it is absent.

## Troubleshooting

- If no statusline appears, confirm Claude Code's `statusLine.command` points to `$HOME/.claude/statusline-limits/statusline.mjs`.
- If Extended mode data is missing, rerun `/statusline-limits:install` and approve copying `limits-fetch.mjs`.
- If output looks stale, remove `$HOME/.claude/statusline-limits/cache.json` and wait for the next refresh.
- If `$HOME/.claude/statusline-limits/limits-fetch.mjs` exists but you never approved Extended mode through `/statusline-limits:install` (an older SessionStart hook deployed it unconditionally before this fix), remove it manually: `rm $HOME/.claude/statusline-limits/limits-fetch.mjs $HOME/.claude/statusline-limits/cache.json`. Extended mode is detected only by that file's presence, so deleting it reverts to Core mode without a full uninstall.

## Development

Run tests:

```sh
bun test scripts/*.test.ts
```

Validate plugin manifests:

```sh
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
```

Run the statusline locally:

```sh
echo '{"model":{"display_name":"Claude"},"context_window":{"used_percentage":10,"used_tokens":10000,"context_window_size":100000}}' | node scripts/statusline.mjs
```

Releases are automated by [release-please](https://github.com/googleapis/release-please) through `.github/workflows/release-please.yml`. The release PR updates `package.json` and `.claude-plugin/plugin.json` together.

## Uninstall

Run:

```text
/statusline-limits:uninstall
```

If install replaced a previous `statusLine`, uninstall restores the saved `$HOME/.claude/statusline-limits/prev-statusline.json` snapshot before removing the runtime directory. If no snapshot exists, uninstall removes the plugin `statusLine` entry.

## License

[MIT](LICENSE) (c) sekka
