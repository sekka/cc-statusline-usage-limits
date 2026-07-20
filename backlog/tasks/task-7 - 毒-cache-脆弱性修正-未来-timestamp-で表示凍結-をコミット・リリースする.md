---
id: TASK-7
title: 毒 cache 脆弱性修正 (未来 timestamp で表示凍結) をコミット・リリースする
status: In Progress
assignee: []
created_date: '2026-07-20 10:25'
labels:
  - fix
  - security
dependencies: []
priority: high
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

herdr-usage-limits の 2026-07-20 インシデント (旧版が書いた未来 timestamp
2033-05-18 の毒 cache で7日間表示凍結) を受けた本リポの点検で、同種脆弱性を確認:

- `scripts/statusline.mjs` `shouldFetch` — `now - lastAttempt > FETCH_MIN_INTERVAL_MS`
  のみで判定。未来の lastAttempt だと差が負になり続け fetch 永久 skip
- 同 `readCache` — `now - timestamp > CACHE_MAX_AGE_MS` のみで判定。未来 timestamp
  だと永久 fresh 扱いで `?` stale マーカーも出ず、凍結が可視化されない

## 実施済み (2026-07-20、branch / PR)

TDD で修正し、ブランチ `fix/poison-cache-and-optin-deploy` にコミット済み。
PR #10 作成済みで、CI test は pass。リリースは未実施 (release-please 待ち)。

- `scripts/statusline.test.ts` — 毒 cache fixture のテスト2件を先行追加
  (「未来の timestamp を持つ cache は stale 扱いにする」「未来の lastAttempt が
   書かれていても fetch は skip されない」)。修正前に 2 fail を確認 (RED)
- `scripts/statusline.mjs` — `readCache`: `record.timestamp > now` を stale 条件に
  追加。`shouldFetch`: `lastAttempt > now` なら fetch 許可
- コミット: `8058f67` ほか
- `bun test` 20 pass / 0 fail 確認済み (GREEN)

## 残作業

1. ~~ブランチを切ってコミット (master 直コミット禁止)~~ 完了
2. ~~PR 作成 → CI test pass~~ 完了: PR #10
3. master マージ → release-please のリリース PR マージ (v1.0.6 想定)

## 関連

- tmux-usage-limits TASK-8 (canonical core の同種修正 + herdr 同期) — 本リポの
  修正はそれと独立で、cache 形式も別 (`nextRetryAt` 無し、timestamp 毒のみ対象)
- 共有パッケージ化後は本リポの fetcher は build 時生成に移行 (TASK-6)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 修正がブランチ経由でコミットされ、PR の CI がパスして master にマージされている
- [ ] #2 release-please のリリースが切られている
<!-- AC:END -->
