---
name: uninstall
description: Remove the statusline-limits stable runtime and statusLine settings.
---

# Uninstall statusline-limits

Use this skill when the user runs `/statusline-limits:uninstall`.

1. Inspect `$HOME/.claude/settings.json`.
2. If `statusLine` points at `node $HOME/.claude/statusline-limits/statusline.mjs`, check `$HOME/.claude/statusline-limits/prev-statusline.json`.
3. If `prev-statusline.json` exists and contains valid JSON, restore that value to the `statusLine` key.
4. If no valid snapshot exists, remove the `statusLine` key.
5. Remove `$HOME/.claude/statusline-limits/` after settings are restored or cleaned up.
6. Leave unrelated settings untouched.

Disabling or uninstalling the Claude Code plugin is not enough by itself. The stable copied script can keep running from `$HOME/.claude/statusline-limits/statusline.mjs` until this uninstall skill removes the runtime and settings entry.
