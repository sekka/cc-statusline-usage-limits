---
id: TASK-1
title: bun test の CI workflow を追加する
status: To Do
assignee: []
created_date: '2026-07-13 03:44'
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

このリポジトリ (statusline-usage-limits) の CI は現状未設定で、テストが CI で走らない。公開配布物として、push/PR 時に `bun test` を走らせる workflow を追加する。

## 内容

- `.github/workflows/test.yml` を追加: `oven-sh/setup-bun` → `bun test`
- テスト対象は `scripts/*.test.ts`
- Node-compatible `.mjs` runtime は zero dependency のまま維持し、CI 依存は test 用の Bun のみに限定する
- tmux-usage-limits / herdr-usage-limits / herdr-tab-title / statusline-usage-limits の4リポジトリで workflow 内容を同一に揃える

## 制約

- feature branch + `build:` または `ci:` prefix(日本語メッセージ)

## 検証

1. push した branch で Actions が green
2. わざと失敗するテストを一時 push して red になることを確認後、revert
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Actions の test workflow が green
- [ ] #2 fail し得ることを確認済み
<!-- AC:END -->
