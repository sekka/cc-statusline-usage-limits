---
id: TASK-13
title: renderer と fetcher の版ずれをサイレント劣化させない
status: Done
assignee: []
created_date: '2026-07-29 05:01'
updated_date: '2026-07-29 21:01'
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
- [x] #1 fetcher が書くレコードに契約バージョンが含まれる
- [x] #2 renderer が版の不一致を検出し statusline 上に表示する
- [x] #3 一致している通常時は表示が変わらない
- [x] #4 sync.sh の配布対象は statusline.mjs のみのまま (TASK-4 の判断を維持)
- [x] #5 版ずれ検出と非検出の両方に bun test のテストがある
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
マージ cc4e5e6。設計 docs/superpowers/specs/2026-07-29-fetcher-contract-version-design.md、計画 docs/superpowers/plans/2026-07-30-fetcher-contract-version.md。

実装:
- scripts/limits-fetch.entry.ts: CONTRACT_VERSION = 2 を export、successRecord / failureRecord の両方に contractVersion を書く (ad4c5c7)
- scripts/statusline.mjs: EXPECTED_FETCHER_CONTRACT = 2、readFetcherContract() は parseCache を通さず生 JSON を読む (0ae5d6c)
- scripts/statusline.mjs: isFetcherContractStale() を純関数として切り出し、定数の重複を排除 (776e45f)

検証:
- bun test 72 pass / 0 fail (着手前 61)
- bun run check:limits-fetch exit 0
- RED 再現: Task 1 は旧 fetcher で 0 pass / 1 fail、Task 2 は isFetcherContractStale 未 export で 0 pass / 1 fail
- 実挙動 (HOME 差し替え): 版印なし→警告あり / 1→警告あり / 2→警告なし / 3→警告なし

設計上の判断:
- readCache は data キーが無いレコードで null を返すため、一度も成功していない fetcher を検出できない。readFetcherContract は生 JSON をパースしてこれを回避
- fetcher の方が新しい場合は警告しない。renderer は hook で自動同期されるため次セッションで解消する一時状態

sync.sh は変更していない (TASK-4 の判断を維持)。
<!-- SECTION:NOTES:END -->
