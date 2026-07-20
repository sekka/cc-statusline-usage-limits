---
id: TASK-8
title: herdrペインID表示をherdr-tab-titleプラグインへ統合する
status: To Do
assignee: []
created_date: '2026-07-13 09:24'
updated_date: '2026-07-20 10:30'
labels:
  - feature
  - setup
dependencies:
  - TASK-9
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 転記: dotfiles TASK-227 より (2026-07-20)。プラグイン群のクロスリポ管理を本リポの
> backlog に集約するため移設。実作業リポは sekka/herdr-tab-title。

## 背景 (2026-07-13 調査済み)

- 現状のペインID表示は scripts/system/herdr-label-sync.ts (commit 692d61e3) が担当。launchd org.nixos.herdr-label-sync (nix/hosts/common.nix, commit 34a08bff) で常駐し、herdr pane rename で ID prefix を付与している。
- 問題: pane label はペイン枠とサイドバーにしか表示されず、1ペインのタブでは ID がどこにも見えない。
- herdr-tab-title との競合は無い (調査で確認済み)。tab-title は herdr tab rename のみ行い、参照するのは pane.title (Claude hook 報告のタスク要約) と pane.agent。pane.label は読まないため上書き合戦は起きていない。純粋に表示面のギャップ。

## 決定事項 (2026-07-13 ユーザー裁定)

- 完全統合: tab-title プラグインがタブとペインラベルの両方を担当し、label-sync 系は廃止する。
- 表記ルールはタブ・ペインとも「pD9: title」で統一 (旧 [pD9] の角括弧形式は廃止、場所による書き分けはしない)。
  - タブ: 「pD9: claude ✳タイトル」
  - ペイン枠 (分割時): 「pD9: claude」

## 実装ポイント

- 作業リポジトリは sekka/herdr-tab-title (dotfiles 環境では開発しない)。ローカルチェックアウト: home/config/herdr/plugins/github/dotfiles.tab-title-4a80a6339f78/、pin は setup/herdr-plugins.txt の latest sentinel。TASK-9 完了後の checkout パスは sekka.tab-title-... になる。
- run.ts の composeAgentLabel (line 54 付近) に ID prefix を追加。shortPaneId 相当は herdr-label-sync.ts:36-39 から移植。
- label-sync の computeLabel / PREFIX_RE は [pXX] 前提なのでそのまま移植せず「pD9: 」形式に書き直す。strip 正規表現は新形式 (^p[0-9A-Z]+:\s*) と旧形式 (^\[p[0-9A-Z]*\]\s\*) の両方を剥がすこと — 既存ペインに旧形式ラベルが残っており、二重 prefix を防ぐため。
- prefix と本文の合成はタブ・ペインで共通化できる (1関数に集約)。LABEL_MAX_CHARS=20 の切り詰めは prefix 適用前の本文だけに掛ける (prefix が要約を食わないように)。
- 複数ペインのタブは representative pane (focused 優先, pickRepresentative) の ID を表示。
- ペイン rename には tab-title の shouldRename 相当のガード (手動ラベル不上書き・自前 state 管理) をペイン側にも用意。
- プラグイン repo のレビューゲート: codex peer review + coderabbit review --base master (repo 同梱 CLAUDE.md 参照)。

## dotfiles 側の後片付け (プラグイン統合が動いた後)

1. scripts/system/herdr-label-sync.ts + herdr-label-sync.test.ts を削除
2. nix/hosts/common.nix の launchd 登録 (27行) を削除 → darwin-rebuild switch
3. 稼働中デーモン停止 (launchctl bootout gui/502/org.nixos.herdr-label-sync)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 タブラベルが「pD9: claude ✳タイトル」形式で表示される (herdr-tab-title が担当)
- [ ] #2 分割時のペインラベルが「pD9: claude」形式で表示される (同プラグインが担当)
- [ ] #3 旧 [pXX] 形式のラベルが残っていても二重 prefix にならない
- [ ] #4 手動リネームしたタブ・ペインは上書きされない
- [ ] #5 dotfiles 側の herdr-label-sync (スクリプト・テスト・nix launchd 登録) が削除され、デーモンが停止している
<!-- AC:END -->
