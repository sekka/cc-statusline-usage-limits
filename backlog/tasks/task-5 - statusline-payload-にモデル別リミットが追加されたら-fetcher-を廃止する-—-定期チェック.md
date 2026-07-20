---
id: TASK-5
title: statusline payload にモデル別リミットが追加されたら fetcher を廃止する — 定期チェック
status: To Do
assignee: []
created_date: '2026-07-20 09:10'
labels:
  - chore
  - watch
dependencies: []
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

Extended mode の fetcher (`limits-fetch.mjs`) が存在する理由は、モデル別週次リミット
(CCF = Fable weekly) が statusline の stdin payload に含まれず、OAuth usage endpoint
(`https://api.anthropic.com/api/oauth/usage`、undocumented) を credential 付きで叩く
しか取得手段が無いこと**のみ**。5時間 (CC5) と全体週次 (CCW) は payload の
`rate_limits.five_hour` / `rate_limits.seven_day` から credential なしで取れている。

Claude Code 本体が payload にモデル別リミット (例: `weekly_scoped`、モデル scope 付き
エントリ) を追加した時点で、fetcher の存在理由が消える。credential 読み取り・
undocumented API 依存・opt-in gate (TASK-4) の全部を廃止でき、プラグイン構成が
大きく単純化するため、変化の検知を定期チェック対象とする。

2026-07-20 時点の確認: 公式ドキュメント
https://code.claude.com/docs/en/statusline の Full JSON schema では `rate_limits` は
`five_hour` / `seven_day` の2キーのみ (各 `used_percentage`, `resets_at`)。
モデル別の項目は無い。

## チェック手順 (繰り返し)

1. https://code.claude.com/docs/en/statusline の Full JSON schema と Available data
   表で `rate_limits` 配下のキーを確認する。
2. `five_hour` / `seven_day` 以外のキー (モデル別・weekly_scoped 相当) が追加されて
   いれば、実 payload でも確認する (statusline スクリプトで stdin を一時ダンプ)。
3. 変化なし → 本タスクの Description 末尾に確認日を追記して To Do のまま維持。
   変化あり → fetcher 廃止の実装タスクを起こし、本タスクを完了にする。

チェック頻度の目安: Claude Code のメジャー/マイナーアップデート時、または月1回。

## 確認ログ

- 2026-07-20: 変化なし (five_hour / seven_day のみ)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 payload にモデル別リミットが追加されたことを docs と実 payload の両方で確認している
- [ ] #2 fetcher 廃止 (limits-fetch.mjs 削除・maybeSpawnLimitsFetch 削除・install/uninstall skill と README の更新) の実装タスクを起票している
<!-- AC:END -->
