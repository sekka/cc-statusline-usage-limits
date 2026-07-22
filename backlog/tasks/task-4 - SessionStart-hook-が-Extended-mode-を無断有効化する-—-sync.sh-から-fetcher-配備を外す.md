---
id: TASK-4
title: SessionStart hook が Extended mode を無断有効化する — sync.sh から fetcher 配備を外す
status: Done
assignee: []
created_date: '2026-07-20 07:12'
updated_date: '2026-07-20 11:55'
labels:
  - fix
  - security
dependencies: []
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 問題

SessionStart hook が Extended mode を無断で有効化する。docs が約束している opt-in ゲートが実装で効いていない。

`hooks/hooks.json` は SessionStart で `scripts/sync.sh` を起動し、`scripts/sync.sh:37-38` は `statusline.mjs` と `limits-fetch.mjs` を**両方とも無条件に** `$HOME/.claude/statusline-limits/` へ配備する。`deploy_file` は dest 不在時も (hash 不一致として) コピーするため、**Core mode のみを承認したユーザーの環境にも fetcher が作られる**。

`scripts/statusline.mjs:306-312` (`maybeSpawnLimitsFetch`) の Extended 判定は **fetcher ファイルの存在のみ**。したがって配備された時点で Extended が有効になり、statusline 実行のたびに fetcher が spawn され、`$HOME/.claude/.credentials.json` / Keychain から bearer token を読み `https://api.anthropic.com/api/oauth/usage` へ送信する。

## docs との矛盾

- `README.md:61` — 「Extended `limits-fetch.mjs` is not auto-synced by the hook because it reads credentials.」
- `skills/install/SKILL.md:34` — 「The fetcher is not auto-synced by the SessionStart hook; rerun this install skill to update it after reviewing the new file.」
- 同 SKILL.md:36 — 「Copy the fetcher only after the user explicitly approves Extended mode.」

いずれも実装と一致していない。

## 修正方針

**実装を docs に合わせる。** docs 側を実装に合わせると credential 同意ゲートを捨てることになるため不可。

- `scripts/sync.sh` の `deploy_file "limits-fetch.mjs"` を削除し、hook が配備するのは `statusline.mjs` のみとする。
- fetcher の配備・更新は `/statusline-limits:install` (開示 + 明示承認) のみを経路とする。
- 既存ユーザーへの影響: hook によって既に配備済みの環境が存在しうる。承認なしに有効化された fetcher の扱い (放置 / 通知 / uninstall skill での掃除) を決めて記述する。

## 発見経緯

sekka/dotfiles TASK-233 (プラグイン四兄妹の dotfiles 依存監査) の副次発見。dotfiles 依存とは無関係のため本リポへ分離。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 scripts/sync.sh が配備するのは statusline.mjs のみになっている (limits-fetch.mjs の deploy_file 呼び出しが無い)
- [x] #2 Core mode のみ承認した新規環境で SessionStart 後に $HOME/.claude/statusline-limits/limits-fetch.mjs が作られないことを確認している
- [x] #3 fetcher の配備経路が /statusline-limits:install の明示承認のみになり、README と install/uninstall skill の記述が実装と一致している
- [x] #4 hook により既に配備済みの環境の扱いを決定し README または uninstall skill に記述している
<!-- AC:END -->
