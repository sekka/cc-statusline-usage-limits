---
id: TASK-14
title: stdin rate_limits 優先修正 (8be6f7b) をリリースする
status: Done
assignee: []
created_date: '2026-07-29 05:02'
updated_date: '2026-07-29 07:59'
labels: []
dependencies: []
priority: high
type: chore
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-07-29 のマージ 8be6f7b で、statusline が stdin の新鮮な rate_limits を捨てて
古い cache を優先していたバグを修正した。master にマージ済み・テスト 61 pass だが、
origin へ push しておらずリリースもしていないため、誰の環境にも届いていない。

配布経路: release → plugin cache 更新 → 次セッションの SessionStart hook で
sync.sh が statusline.mjs を入れ替える。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 origin/master に push されている
- [x] #2 release-please のリリースが完了している
- [x] #3 デプロイ済み statusline.mjs が plugin cache 1.0.11 と byte 一致する: diff -q ~/.claude/plugins/cache/cc-statusline-usage-limits/statusline-limits/1.0.11/scripts/statusline.mjs ~/.claude/statusline-limits/statusline.mjs が無出力で exit 0
- [x] #4 デプロイ済み statusline.mjs に修正本体が含まれる: grep -c mergeLimitItems ~/.claude/statusline-limits/statusline.mjs が 2 を返す
- [x] #5 デプロイ済みファイルで stdin 優先の挙動を実測: stale cache と新鮮な stdin rate_limits を同時に与え、stdin の値が表示され ? と (Nm ago) が出ないことをコマンド出力で確認する。実 cache の鮮度に依存しない条件で行うこと
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
scripts/verify-deployed.sh (a88caa8) で検証。実行結果:

deployed (1.0.11):
  PASS deployed statusline byte-matches latest plugin cache
  PASS deployed statusline contains mergeLimitItems
  PASS stdin rate_limits override stale cache by window
  EXIT=0

落ちるべき時に落ちる証明 — STATUSLINE_DEPLOYED_PATH で 1.0.10 を指した場合:
  FAIL x3, EXIT=1
  behavior_output=VerifyModel CC5?:13% CCW?:87% ... (10m ago)
  (stdin の 61/22 ではなく cache の 13/87 が出て ? と age suffix が付く = 修正前の挙動)

deployed statusline.mjs: mtime Jul 29 16:43, mergeLimitItems 2箇所, 1.0.11 と byte 一致。
<!-- SECTION:NOTES:END -->
