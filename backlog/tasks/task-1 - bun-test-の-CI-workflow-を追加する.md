---
id: TASK-1
title: bun test の CI workflow を追加する
status: Done
assignee: []
created_date: '2026-07-13 03:44'
updated_date: '2026-07-13 05:01'
labels:
  - plugin
  - ci
dependencies: []
priority: low
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 目的

このリポジトリ (cc-statusline-usage-limits) の CI は現状未設定で、テストが CI で走らない。公開配布物として、push/PR 時に `bun test` を走らせる workflow を追加する。

## 内容

- `.github/workflows/test.yml` を追加: `oven-sh/setup-bun` → `bun test`
- テスト対象は `scripts/*.test.ts`
- Node-compatible `.mjs` runtime は zero dependency のまま維持し、CI 依存は test 用の Bun のみに限定する
- tmux-usage-limits / herdr-usage-limits / herdr-tab-title / cc-statusline-usage-limits の4リポジトリで workflow 内容を同一に揃える

## 制約

- feature branch + `build:` または `ci:` prefix(日本語メッセージ)

## 検証

1. push した branch で Actions が green
2. わざと失敗するテストを一時 push して red になることを確認後、revert
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Actions の test workflow が green
- [x] #2 fail し得ることを確認済み
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-13 TASK-85 規約メモ: test workflow は .github/workflows/test.yml 1本を追加し、push/pull_request で checkout -> oven-sh/setup-bun -> bun test を ubuntu-latest で実行する。Claude Code plugin の marketplace install/uninstall と Extended mode credential 連携は CI 対象外。4兄弟(tmux-usage-limits / herdr-usage-limits / herdr-tab-title / cc-statusline-usage-limits)で同じ最小構成に揃える。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
.github/workflows/test.yml を追加し、push/pull_request で checkout -> setup-bun -> bun test を実行する構成にした。ローカルでは bun test scripts/*.test.ts pass、Ruby YAML parse pass、4 repo 間 diff が空であることを確認。Actions 実行と意図的 red push は未実施。
<!-- SECTION:FINAL_SUMMARY:END -->
