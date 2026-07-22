# usage-limits family 実行順マイルストーン

作成 2026-07-20。四兄弟 (cc-statusline / tmux / herdr-usage-limits / herdr-tab-title) +
dotfiles 側同期変更の全タスクの推奨実行順。管理の正はこの文書 (cc-statusline backlog が
クロスリポ集約先)。cc = cc-statusline-usage-limits。

## M1: 安全性修正 (最優先・進行中)

ユーザー影響が出ているバグの恒久対応。パッケージ化を待たない。

1. tmux TASK-8 — cache 読み込み時バリデーション (canonical、TDD、Claude/Codex 両経路)
2. herdr-usage-limits TASK-5 — 上記をコピー同期で受領 (既存 sync-core.sh を最後に使う場面)
3. cc TASK-7 — 修正済み・未コミットの毒 cache fix をコミット→リリース (~v1.0.6)。1-2 と並行可
4. cc TASK-4 — sync.sh の fetcher 無断配備を除去。小変更なので TASK-7 と同じリリースに同乗

出口条件: 3リポとも毒 cache 修正がリリース済み、cc の Extended 無断有効化が解消。

## M2: id リネーム (dotfiles.* → sekka.*)

M3 より先に行う理由: パッケージ新設時の README・マニフェスト整備を新 id 前提で 1 回で
済ませるため。仕様の正は cc TASK-9。

1. herdr-usage-limits TASK-6 + herdr-tab-title TASK-6 + tmux TASK-9 (残骸除去) — 3リポ並行可
2. dotfiles 側 6 ファイルの同期変更 (setup/herdr-plugins.txt ほか、同一コミット群で)
3. herdr 上で旧 id uninstall → 新 id 登録・動作確認 (cc TASK-9 AC#3)

出口条件: 全リポ・dotfiles で `dotfiles.*` 参照 0 hit、herdr 動作確認済み。

## M3: 共有パッケージ化

M1 の修正済み core を引き継ぐ (依存: M1 完了)。

1. tmux TASK-7 — パッケージリポ新設 (sekka/usage-limits-core 想定)・tmux を参照切り替え
2. herdr-usage-limits TASK-4 — 参照切り替え + sync-core.sh 削除 (最後のリポ間 build 依存が消える)
3. cc TASK-6 — build 時生成方式で limits-fetch.mjs をパッケージから生成

出口条件: 3リポがタグ pin の git dependency 参照、コピー同期・sync-core.sh 廃止。

## M4: 機能統合

1. herdr-tab-title TASK-5 — ペインID表示統合 (仕様の正: cc TASK-8) + dotfiles 側
   label-sync 廃止。M2 の後 (同じ README / run.ts 周辺を触るため)

## M5: 検証・クローズ

1. cc TASK-10 — 依存ゼロ最終検証 (4リポ grep + sync-core.sh 不在確認)
2. cc TASK-9 AC#5 — dotfiles リポ無しでの 4 プラグイン live 動作確認

## 継続 (マイルストーン外)

- cc TASK-5 — statusline payload にモデル別リミットが載ったら fetcher 廃止 (定期チェック、
  廃止判断は 3 リポ + パッケージに波及)

## 運用ルール: backlog status の同期 (2026-07-20 追加)

status 更新を記憶頼みにしない。実装を委任する dispatch brief には必ず「完了時に実行する
backlog コマンド」セクション (`backlog task edit <id> -s <status> --check-ac <n>` の具体
コマンド、**実行リポの cd 付き**) を含め、作業と status 更新を不可分にする。委任しない
ステップ (merge・リリース) は、その操作の直後に同 turn で status を更新する。タスクの
所属リポを取り違えないこと (TASK-n は各リポに別々に存在する)。

## 依存関係の要点

- M3 は M1 に依存 (パッケージは修正済み core を切り出す)
- M2 と M1 は独立 (並行可だが、リリース作業の混線を避け M1 完了後に着手を推奨)
- M4 は M2 の後、M5 は M2-M4 全完了後
- 各リポの既存 repo-local タスク (tmux TASK-1〜6 等) はこの順序制約の外
