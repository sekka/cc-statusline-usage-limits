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
2b. docs はラグがあるため、実装側も直接確認する (docs より確実)。
    `grep 'rate_limits:'` は禁止 — 制御プロトコル `get_usage` 側の
    `rate_limits:...{...n,model_scoped:i}` にもヒットし、偽陽性になる。
    statusline payload 生成関数だけを見るため `exceeds_200k_tokens:` を
    アンカーにする (minify 後の識別子 `I` / `yRS` はビルド毎に変わるので不可):

    ```sh
    B=$(command -v claude)
    strings -a "$B" >| /tmp/ccstr.txt
    node -e 'const s=require("fs").readFileSync("/tmp/ccstr.txt","utf8");
    const i=s.indexOf("exceeds_200k_tokens:");console.log(s.slice(i-1200,i+400))'
    ```

    出力に `rate_limits` へ流し込むオブジェクトの構成が含まれる。下記
    2026-07-27 のベースラインと差分を取り、`five_hour` / `seven_day` 以外の
    キーが加わっていれば露出済み。
3. 変化なし → 本タスクの Description 末尾に確認日を追記して To Do のまま維持。
   変化あり → fetcher 廃止の実装タスクを起こし、本タスクを完了にする。

チェック頻度の目安: Claude Code のメジャー/マイナーアップデート時、または月1回。

## 確認ログ

- 2026-07-20: 変化なし (five_hour / seven_day のみ)
- 2026-07-27: 変化なし。統合バイナリ (claude 2.1.220, GIT_SHA 4073f59) の statusline
  payload 生成関数を確認し、`rate_limits` は `five_hour` / `seven_day` の2キーのみ
  (`...(I.five_hour||I.seven_day)&&{rate_limits:I}`、I は両キーのみで構成)。docs も同一。
  ただし本体内部には既にモデル別リミットが存在する: 制御プロトコルの `get_usage`
  (experimental) が返す構造で `rate_limits.model_scoped[]` (`display_name` /
  `utilization` / `resets_at`)、加えて `seven_day_opus` / `seven_day_sonnet` /
  `seven_day_oauth_apps` / `extra_usage`。取得元は本 repo の fetcher と同じ
  `/api/oauth/usage` で、CC 本体が credential を扱う。`/usage` コマンドの表示にも
  「Current week (Sonnet only)」等として使われている。ただし `get_usage` は Agent SDK の
  制御プロトコル (stdio JSON-RPC) 上のリクエストであり、statusline スクリプト
  (stdin に payload を渡されるだけの子プロセス) からは到達不能。fetcher の代替には
  ならない。
  → payload 露出は未了なので fetcher は現状維持。次回チェック時は手順 2b で
  ベースライン差分を取る。

  ベースライン (2.1.220, 手順 2b の出力から payload 生成部のみ抜粋):

  ```js
  A=DYr(),I={...A.five_hour&&{five_hour:{used_percentage:A.five_hour.utilization*100,
  resets_at:A.five_hour.resets_at}},...A.seven_day&&{seven_day:{used_percentage:
  A.seven_day.utilization*100,resets_at:A.seven_day.resets_at}}}
  ...
  ...(I.five_hour||I.seven_day)&&{rate_limits:I},
  ```
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 payload にモデル別リミットが追加されたことを docs と実 payload の両方で確認している
- [ ] #2 fetcher 廃止 (limits-fetch.mjs 削除・maybeSpawnLimitsFetch 削除・install/uninstall skill と README の更新) の実装タスクを起票している
<!-- AC:END -->
