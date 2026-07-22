---
id: TASK-11
title: herdr plugins.json 巻き戻り異常の root cause 調査
status: Done
assignee: []
created_date: '2026-07-21 23:54'
updated_date: '2026-07-22 01:49'
labels: []
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-07-21 06:49 に ~/.config/herdr/plugins.json が M2 で削除済みの旧 dotfiles.* プラグイン構成 (旧 SHA 846c707) へ書き戻されていた。

観測事実:
- plugins.json mtime: Jul 21 06:49、内容は dotfiles.* エントリのみ
- ~/.config/herdr/config.toml (symlink) と dotfiles repo は正常 (sekka.* 構成)
- herdr server log に該当時刻のプラグイン API イベントなし
- 旧プラグインディレクトリ由来の stale daemon も稼働していた (kill 済み)

仮説 (未検証): herdr server がメモリ上の古い plugin registry を永続化した、または converge 処理の quirk。

再発 (2026-07-22): `herdr plugin list` から sekka.tab-title が消え、廃止済み dotfiles.tab-title@6f03a23 が復活していた (sekka.usage-limits は無事)。dotfiles.tab-title を uninstall し sekka/herdr-tab-title --ref 388a395 を install して復旧。

状態は手動修復済み (sekka.usage-limits@2eb38c6 / sekka.tab-title@d74891d 再インストール、daemon 再起動・cwd 検証済み) だが、herdr 再起動や converge で再発するリスクあり。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 巻き戻りの発生経路を特定し、証跡 (書き込み元プロセスの特定根拠、該当ログ抜粋または state ファイルの mtime/内容、発生時刻のタイムライン再構成) を本タスクに記録する
- [x] #2 再発防止策を実装 (commit SHA を記録) するか herdr 側へ issue 起票 (issue URL を記録) し、どちらを選んだかの判断理由を記す
- [x] #3 再現手順 (コマンドと期待結果・実測結果) または「再発しないこと」の確認手順を記録し、少なくとも 1 回実測して結果を残す
<!-- AC:END -->

## 調査結果 (2026-07-22, codex 委任調査)

**Root cause (機構レベルで特定)**: herdr の plugins.json は宣言的 config ではなく **runtime registry** で、save は常に registry 全体の atomic rewrite。古い in-memory snapshot を持つ writer が save すると手動更新が丸ごと巻き戻る。

- herdr 0.7.4 server (PID 1013) は 2026-07-20 14:41 JST 起動 — **sekka.* 移行より前**。registry は startup 時に一度だけ load され、`server.reload_config` でも reload されない (source 確認)
- save 経路は plugin.link/unlink/enable/disable の API と、server 接続不可時の CLI offline fallback (`src/cli/plugin.rs` が load/save で直接上書き) の 2 系統
- dotfiles converge / commit 1933161 に plugins.json を書く経路なし。tools.common.yaml は sekka.* 宣言で正常
- stale 残骸: `~/.config/herdr/plugins/config/dotfiles.*` と `~/.local/state/herdr/plugins/dotfiles.*` (旧 PID 53630/53672 は死亡済み)
- 現在は live registry と plugins.json は同期済み (sekka.* 2 件 + 他 3 件)

**GAPS**: 巻き戻った瞬間のファイル内容は復旧済みで未取得。server log が plugin id を出さないため、最終 writer が running server か offline CLI かは断定不能 (AC#1 の「書き込み元プロセスの特定」はこの粒度が限界)。

**Source 証跡**: `src/persist/plugin_registry.rs` (atomic rewrite)、`src/app/mod.rs` (startup load のみ)、`src/app/api/plugins/mod.rs`、`src/cli/plugin.rs` — いずれも https://github.com/ogulcancelik/herdr/tree/v0.7.4

**再発防止案 (未実施、ユーザー判断待ち)**:
1. dotfiles converge 後に `herdr plugin list --json` を検査し dotfiles.* 残存で fail-loud する guard
2. herdr server 起動中は plugins.json を直接編集しない運用 (CLI 経由 + 事後照合)
3. stale な dotfiles.* の config/state ディレクトリ削除
4. upstream issue: registry reload 手段の欠如 + save log に plugin id を出す改善

## 再発防止の実施記録 (2026-07-22, ユーザー裁定: 1+3 実施・4 起票)

- 案 3 実施: `~/.config/herdr/plugins/config/dotfiles.{tab-title,usage-limits}` と `~/.local/state/herdr/plugins/dotfiles.{tab-title,usage-limits}` を退避削除 (旧 daemon の死亡を pgrep で確認済み)。無関係の可能性がある `dotfiles.root-probe` 等 probe 残骸 3 件は保留
- 案 4 実施: upstream issue 起票 → https://github.com/ogulcancelik/herdr/issues/1704
- 案 1 実施: dotfiles converge 後の fail-loud guard を実装・merge (dotfiles PR #43, commit 1ac529c8)。`setup/converge/herdr-plugins.ts` が収束後に `herdr plugin list --json` を再取得し、`DEPRECATED_HERDR_PLUGIN_IDS` (dotfiles.tab-title / dotfiles.usage-limits) の残存で throw。list 失敗時は警告のみで skip

## AC#3 確認手順と実測 (2026-07-22)

手順: guard 単体に fake registry JSON を与えて挙動確認。
- 正常 registry (sekka.* のみ) → exit 0 (実測 ok)
- dotfiles.* を含む registry → exit 1、`dotfiles.tab-title, dotfiles.usage-limits` を明示 (実測 ok)
- 以後は毎回の `./sync.sh` converge が同検査を自動実行するため、巻き戻り再発は converge 時点で fail-loud に検出される
