---
id: TASK-3
title: release-please 構成を四兄弟標準に揃える
status: Done
assignee: []
created_date: '2026-07-13 04:17'
updated_date: '2026-07-13 04:17'
labels:
  - plugin
  - release
dependencies: []
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 目的

cc-statusline-usage-limits に三兄弟と同じ release-please 構成を導入し、公開 plugin のリリース PR フローを標準化する。

## 内容

- `.github/workflows/release-please.yml` を追加する
- `release-please-config.json` を追加する
- `.release-please-manifest.json` を追加する
- manifest version は現行 `0.1.0` に合わせる
- `.claude-plugin/plugin.json` と `package.json` の version が release-please PR で同時に更新されるよう `extra-files` を設定する

## 検証

- 三兄弟の release-please workflow と本質差分がないこと
- `bun test scripts/*.test.ts` が pass
- JSON files が parse できること
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 release-please workflow が追加されている
- [x] #2 manifest が 0.1.0 で初期化されている
- [x] #3 package.json と plugin.json の version bump が extra-files に設定されている
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
release-please workflow / config / manifest を追加した。workflow は tmux-usage-limits の release-please.yml と diff なし。manifest は 0.1.0。release-please の extra-files(jsonpath)で package.json と .claude-plugin/plugin.json の version を同時更新対象にした。bun test scripts/*.test.ts と JSON parse 確認済み。
<!-- SECTION:FINAL_SUMMARY:END -->
