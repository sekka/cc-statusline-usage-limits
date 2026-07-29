---
id: TASK-14
title: stdin rate_limits 優先修正 (8be6f7b) をリリースする
status: To Do
assignee: []
created_date: '2026-07-29 05:02'
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
- [ ] #1 origin/master に push されている
- [ ] #2 release-please のリリースが完了している
- [ ] #3 plugin cache 更新後、statusline に stale でない CC5/CCW が出ることを実機で確認
<!-- AC:END -->
