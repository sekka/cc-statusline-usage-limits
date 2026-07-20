---
name: install
description: Install or update the statusline-limits plugin runtime.
---

# Install statusline-limits

Use this skill when the user runs `/statusline-limits:install`.

## Core install

1. Copy `${CLAUDE_PLUGIN_ROOT}/scripts/statusline.mjs` to `$HOME/.claude/statusline-limits/statusline.mjs`.
2. Ensure `$HOME/.claude/statusline-limits` exists with mode `0700`; set copied scripts to mode `0600`.
3. If `$HOME/.claude/settings.json` already has a `statusLine` value that is not this plugin command, show it to the user and ask before replacing it. If the user approves replacement, save the previous value to `$HOME/.claude/statusline-limits/prev-statusline.json` before editing settings.
4. Update `$HOME/.claude/settings.json` so `statusLine` is:

```json
{
  "type": "command",
  "command": "node $HOME/.claude/statusline-limits/statusline.mjs",
  "refreshInterval": 30
}
```

If the existing `statusLine` already points at `node $HOME/.claude/statusline-limits/statusline.mjs`, do not overwrite `prev-statusline.json`.

## Extended opt-in

Extended mode is enabled only when `$HOME/.claude/statusline-limits/limits-fetch.mjs` exists. Before copying `${CLAUDE_PLUGIN_ROOT}/scripts/limits-fetch.mjs`, disclose this exactly:

- **It reads `$HOME/.claude/.credentials.json`, then falls back to the macOS Keychain item `Claude Code-credentials`.**
- **It sends the bearer token to `https://api.anthropic.com/api/oauth/usage`.**
- **The endpoint and beta header are undocumented and may change or fail without notice.**
- The fetcher is not auto-synced by the SessionStart hook; rerun this install skill to update it after reviewing the new file.

Copy the fetcher only after the user explicitly approves Extended mode. When copying the fetcher, also create `$HOME/.claude/statusline-limits/.extended-approved` in the same destination directory. Do not add a global environment flag.

## Verification

After installing, run:

```sh
echo '{"model":{"display_name":"Claude"},"context_window":{"used_percentage":10,"used_tokens":10000,"context_window_size":100000}}' | node "$HOME/.claude/statusline-limits/statusline.mjs"
```

Confirm that the command prints a single statusline.
