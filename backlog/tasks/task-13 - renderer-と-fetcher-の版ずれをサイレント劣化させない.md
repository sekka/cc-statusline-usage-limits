---
id: TASK-13
title: renderer と fetcher の版ずれをサイレント劣化させない
status: To Do
assignee: []
created_date: '2026-07-29 05:01'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
statusline.mjs は SessionStart hook (sync.sh) で自動配布されるが、limits-fetch.mjs は
TASK-4 の判断で意図的に自動同期対象から外されている (資格情報を読むため人間のレビューが要る)。
この非対称により、renderer だけ更新され fetcher が古いまま残る版ずれが発生する。

2026-07-29 に実際に発生した状態:
- statusline.mjs (Jul 27 版) は 429 の指数バックオフに record.lastError / consecutiveFailures を読む
- インストール済み limits-fetch.mjs (Jul 22 版) の failureRecord() はそのどちらも書かない
- 結果、バックオフがエスカレーションせず 60 秒固定のまま。例外は出ず、もっともらしい挙動に化ける

問題は非対称そのものではなく、契約の不一致を検出する仕組みが無いこと。
配布先では誰も気づけない。

TASK-4 の判断 (fetcher を自動配布しない) は維持する。sync.sh に fetcher を戻す方向では直さない。

方針案: cache レコードに fetcher 側が書く契約バージョン印を持たせ、renderer が
期待と食い違ったら黙って劣化せず statusline 上に出す。既存の
「Extended 要再承認 → /statusline-limits:install」表示 (TASK-12) と同じ経路に乗せられる。

前提の変化: 2026-07-29 のコミット 8be6f7b で CC5/CCW は stdin の rate_limits を
優先するようになったため、fetcher 依存は CCF (model scoped) と extra usage のみに縮んだ。
影響範囲は当初より小さいが、CCF は依然 fetcher 経由。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fetcher が書くレコードに契約バージョンが含まれる
- [ ] #2 renderer が版の不一致を検出し statusline 上に表示する
- [ ] #3 一致している通常時は表示が変わらない
- [ ] #4 sync.sh の配布対象は statusline.mjs のみのまま (TASK-4 の判断を維持)
- [ ] #5 版ずれ検出と非検出の両方に bun test のテストがある
<!-- AC:END -->
