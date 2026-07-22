---
id: TASK-6
title: limits-fetch.mjs を共有パッケージから build 時生成に切り替える
status: Done
assignee: []
created_date: '2026-07-20 10:00'
updated_date: '2026-07-22 00:27'
labels:
  - refactor
dependencies: []
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

`scripts/limits-fetch.mjs` は、tmux-usage-limits / herdr-usage-limits が共有する
usage-limits-core (credential 読み取り・oauth/usage API・weekly_scoped パース) と
同じロジックの独自実装。undocumented endpoint の仕様変更時に3リポを手で同時修正する
リスクがある。共有パッケージリポ新設の方針は tmux-usage-limits TASK-7 を正とする。

本リポの制約: 配備物は `~/.claude/statusline-limits/` へコピーされる自己完結の
単一ファイルであり (sync.sh の deploy_file、node_modules 無し)、TASK-4 の同意ゲートは
「配備される limits-fetch.mjs をユーザーがレビューして承認する」設計。したがって
実行時 package 依存は不可で、**build 時生成**で参加する。

## 修正方針

1. 共有パッケージを devDependency (immutable な commit SHA または digest pin) にする
2. 決定的な生成スクリプトを追加し、package から単一ファイルの `limits-fetch.mjs` を
   生成して**コミットする** (生成物は diff レビュー可能なまま保つ)
3. CI で「生成物が pinned revision と同期しているか」を検証し、指定 revision から
   再生成した `limits-fetch.mjs` とコミット済み生成物が一致することを確認する
4. TASK-5 (payload 拡張で fetcher 廃止) はそのまま維持。廃止条件が来たら本リポだけ
   fetcher と生成工程を落とし、package は tmux/herdr 用に存続する

## 依存

- tmux-usage-limits TASK-7 (共有パッケージリポ新設) の完了が前提
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 limits-fetch.mjs が生成スクリプト経由で共有パッケージから決定的に生成され、コミットされている
- [x] #2 生成物が自己完結の単一ファイルのままで、sync.sh の配備モデルと install skill のレビューゲートが変わっていない
- [x] #3 CI が生成物と package バージョンの同期を検証している
- [x] #4 bun test が全パスしている
<!-- AC:END -->
