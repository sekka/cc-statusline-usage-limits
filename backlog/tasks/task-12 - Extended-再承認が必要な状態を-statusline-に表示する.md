---
id: TASK-12
title: Extended 再承認が必要な状態を statusline に表示する
status: Done
assignee:
  - '@codex'
created_date: '2026-07-22 07:04'
updated_date: '2026-07-22 07:07'
labels: []
dependencies: []
modified_files:
  - scripts/statusline.mjs
  - scripts/statusline.test.ts
type: bug
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v1.0.6 より前から Extended mode を利用して自動更新した環境では、limits-fetch.mjs が存在しても .extended-approved が無く、usage gauge が無言で stale のままになる。明示的な再承認が必要だと statusline で案内する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 limits-fetch.mjs が存在し .extended-approved が無い場合、statusline に Extended の再承認案内と /statusline-limits:install が表示される
- [x] #2 .extended-approved が存在する場合、または limits-fetch.mjs が存在しない場合、statusline 出力は従来と同一である
- [x] #3 再承認状態の検出は注入可能な stat 実装を受け取る純粋 helper として単体テストされる
- [x] #4 .extended-approved は自動作成されない
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. statusline の再承認状態を表す純粋 helper の失敗テストを追加し、RED を保存する。 2. helper と renderStatusline の移行通知を最小実装し、対象テストを GREEN にする。 3. main から helper の検出結果を描画へ渡し、状態が無い場合の既存 golden が不変なことを確認する。 4. 全テストを実行し、Backlog の受入条件を客観的に検証して完了記録する。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TDD RED: bun test scripts/statusline.test.ts failed because needsExtendedReapproval export was absent (0 pass, 1 fail, 1 error); saved at /private/tmp/task235-red.txt. GREEN: bun test scripts/*.test.ts passed 27 tests across 4 files with 0 failures. CLI integration emitted Extended 要再承認 → /statusline-limits:install with exit 0; scripts/.extended-approved remained absent.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added pure Extended reapproval detection and a statusline notice wired through main without changing the fetch spawn contract or creating consent markers. Verified helper branches, byte-identical legacy golden output, notice rendering, CLI integration, and all 27 repository tests.
<!-- SECTION:FINAL_SUMMARY:END -->
