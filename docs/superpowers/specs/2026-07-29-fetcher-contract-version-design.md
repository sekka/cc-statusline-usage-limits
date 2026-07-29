# renderer と fetcher の版ずれをサイレント劣化させない

TASK-13 の設計。2026-07-29。

## 解決する問題

`statusline.mjs` (renderer) は SessionStart hook の `scripts/sync.sh` で自動配布されるが、
`limits-fetch.mjs` (fetcher) は TASK-4 の判断で自動同期対象から外れている。fetcher は
資格情報を読んで外部に送るため、更新のたびに人間のレビューを挟む設計になっている。

この非対称により、renderer だけ更新され fetcher が古いまま残る状態が発生する。

2026-07-29 に実際に起きた例:

- renderer (Jul 27 版) は 429 の指数バックオフに `record.lastError` と
  `record.consecutiveFailures` を読む
- インストール済み fetcher (Jul 22 版) の `failureRecord()` はそのどちらも書かない
- バックオフがエスカレーションせず 60 秒固定のままになる

例外は出ない。「バックオフ 60 秒」というもっともらしい挙動に化けるため、配布先では
誰も気づけない。問題は非対称そのものではなく、契約の不一致を検出する仕組みが無いこと。

## 方針

TASK-4 の判断 (fetcher を自動配布しない) は維持する。`sync.sh` の配布対象は
`statusline.mjs` のみのままとし、代わりに不一致を検出して表示する。

## 契約バージョン

`scripts/limits-fetch.entry.ts` に `CONTRACT_VERSION = 2` を定義し、`successRecord()` と
`failureRecord()` が返すレコードに `contractVersion` を含める。

renderer 側は `scripts/statusline.mjs` に `EXPECTED_FETCHER_CONTRACT = 2` を持つ。

現行 fetcher が書くレコードには版印が無い。これが version 1 にあたる。`2` から始めるのは、
`?? 0` で欠落を確実に「古い」と判定するため。

契約は追加のみで変更する。フィールドの削除や意味の変更を行う場合は版を上げる。

## 検出条件

cache.json が存在し、かつ次を満たすとき版ずれと判定する。

```
(record.contractVersion ?? 0) < EXPECTED_FETCHER_CONTRACT
```

判定しないケース:

- **cache.json が無い** — Extended mode 未使用、または fetcher が一度も走っていない。
  警告する根拠が無い
- **`contractVersion > EXPECTED_FETCHER_CONTRACT`** — fetcher の方が新しい。renderer は
  hook で自動同期されるため次セッションで解消する一時状態であり、契約は追加のみなので
  renderer は古いフィールドを読み続けられる。ここで警告すると自己解消するノイズになる

## 表示

TASK-12 の `extendedReapprovalRequired` と同じ経路に乗せる。`renderStatusline` の
`options` に `fetcherContractStale` を追加し、`statusline.mjs` の
`Extended 要再承認` 行の直後に黄色の一行を出す。

```
fetcher が古い → /statusline-limits:install
```

`/statusline-limits:install` は fetcher をレビューして更新する導線であり、TASK-4 が
定めた経路と一致する。

## 値の扱い

変更しない。CCF (model scoped) と extra usage は従来どおり表示する。

今回の v1 → v2 は `lastError` / `consecutiveFailures` の追加のみで、`data` 部分の形は
変わっていない。値そのものは正しく、壊れているのはバックオフの振る舞いだけ。値を
消すと、正しいデータを失う方が損失として大きい。

## テスト

`scripts/statusline.test.ts`:

- 版印が一致 → 警告なし。表示が従来と byte 単位で同一
- 版印が無い (旧 fetcher が書いたレコード) → 警告あり
- 版印が期待より新しい → 警告なし
- cache.json 無し → 警告なし

`scripts/limits-fetch.test.ts`:

- `successRecord()` が `contractVersion` を含む
- `failureRecord()` が `contractVersion` を含む
- 既存レコードの `contractVersion` に関わらず、書き出す値は現在の `CONTRACT_VERSION`

## リリース時の副作用

これをリリースすると、古い fetcher を持つ全環境で即座に警告が出る。これはタスクの
目的そのものだが、同僚の statusline にも一斉に現れる。

解消には各自が `/statusline-limits:install` を実行して fetcher をレビュー・更新する。
TASK-4 が設計した導線どおりの動作。

## 変更しないもの

- `scripts/sync.sh` — 配布対象は `statusline.mjs` のみのまま
- fetcher の資格情報の読み取り経路と送信先
- CC5 / CCW の表示 — 2026-07-29 のコミット `8be6f7b` 以降、stdin の `rate_limits` を
  優先するため fetcher に依存しない
