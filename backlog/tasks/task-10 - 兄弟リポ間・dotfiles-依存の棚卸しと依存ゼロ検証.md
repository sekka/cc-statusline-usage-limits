---
id: TASK-10
title: 兄弟リポ間・dotfiles 依存の棚卸しと依存ゼロ検証
status: To Do
assignee: []
created_date: '2026-07-20 11:05'
labels:
  - audit
  - cross-repo
dependencies: []
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
目標: これから作る共有パッケージ (git dependency) 以外に、四兄弟リポ間および dotfiles への
依存が存在しない状態にし、それを検証して記録する。

## 棚卸し結果 (2026-07-20 全4リポ grep 調査)

| 依存 | 場所 | 解消タスク |
| --- | --- | --- |
| herdr plugin id `dotfiles.usage-limits` | herdr-usage-limits: herdr-plugin.toml / README (5箇所) / verify/manifest.json | TASK-9 + herdr-usage-limits TASK-6 |
| herdr plugin id `dotfiles.tab-title` | herdr-tab-title: herdr-plugin.toml / README (5箇所) / claude-code-hook コメント | TASK-9 + herdr-tab-title TASK-6 |
| id 残骸 (不活性) | tmux-usage-limits verify/manifest.json:2 + verify/README.md の dotfiles 手順参照 | tmux TASK-9 |
| cross-repo build 依存: sync-core.sh (herdr→tmux 隣接 checkout 前提の cp) | herdr-usage-limits scripts/sync-core.sh:7-10 | パッケージ化で削除 (herdr TASK-4 AC#3) |
| dotfiles 側の herdr keybinding が `--plugin dotfiles.*` を参照 | dotfiles (herdr config / setup マニフェスト等 6 ファイル) | TASK-9 の同期変更手順 |

問題なしを確認済み: ハードコード絶対パス (`/Users/kei`, `~/src/...`) は 4 リポとも 0 件。
dotfiles の setup スクリプトを前提とする install 手順も 0 件。cc-statusline は完全自己完結
(marketplace 経由 install、dotfiles.* namespace 概念なし)。dotfiles 内の独立第3実装
(`home/.claude/statusline/limits-fetch.ts`) は同期対象外・依存なしを spec 文書で確認。

## 最終検証 (上記解消タスク完了後)

1. 4 リポで `grep -rniE 'dotfiles' . --exclude-dir=backlog --exclude=CHANGELOG.md | grep -v '^./docs/specs/'` → 0 hit
2. sync-core.sh が存在しない・パッケージ参照のみが唯一のリポ間依存であることを確認
3. TASK-9 AC#5 (dotfiles リポ無しでの live 動作確認) と併せてクローズ
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 表中の全解消タスクが Done になっている
- [ ] #2 最終検証 grep が 4 リポで実行され、結果 (0 hit または許容される記録文書のみ) が本タスクに追記されている
<!-- AC:END -->
