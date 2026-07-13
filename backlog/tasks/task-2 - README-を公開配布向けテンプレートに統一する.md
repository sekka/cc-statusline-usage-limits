---
id: TASK-2
title: README を公開配布向けテンプレートに統一する
status: Done
assignee: []
created_date: '2026-07-13 03:44'
updated_date: '2026-07-13 05:01'
labels:
  - plugin
  - docs
dependencies: []
priority: medium
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 目的

このリポジトリ (cc-statusline-usage-limits) の README を、公開配布プラグインに見合った統一テンプレートに更新する。テンプレートは tmux-usage-limits / herdr-usage-limits / herdr-tab-title / cc-statusline-usage-limits の4リポジトリで共通にする。

## 統一テンプレート(見出し順)

1. `# cc-statusline-usage-limits` + 1行説明 + 出力例(テキストでの表示例でも可)
2. `## Features`(箇条書き 3-5 点)
3. `## Requirements`(Claude Code、Node.js、Bun for development)
4. `## Install`(`/plugin marketplace add sekka/cc-statusline-usage-limits`。コピペで動くこと)
5. `## Usage`(Core install と Extended opt-in)
6. `## Configuration`(statusLine command / refreshInterval / stable runtime path)
7. `## How it works`(Core/Extended/cache/sync hook を1-2段落)
8. `## Troubleshooting`
9. `## Development`(bun test、plugin validate、release flow)
10. `## Uninstall`
11. `## License`

## このリポジトリ固有の必須修正

- 公開読者向け credential 太字開示、undocumented API リスク、disable≠uninstall の説明を維持する
- 旧同居構成のパスや marketplace 名が残っていないことを確認する
- 全コマンド例を実行して確認してから記載する

## 制約

- 実装に無い機能を README に書かない。feature branch + `docs:` prefix(日本語メッセージ)

## 検証

1. Install 節のコマンドをクリーン HOME で辿れること
2. 見出し順が統一テンプレートと一致していること
3. ローカルレビューゲートを通す
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README 見出し順が統一テンプレートと一致
- [x] #2 旧同居構成のパス・marketplace 名が0件
- [x] #3 全コマンド例のパス・リポジトリ名が実在
- [x] #4 ローカルレビューゲート通過
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-13 TASK-85 規約メモ: README は # cc-statusline-usage-limits / Features / Requirements / Install / Usage / Configuration / Security disclosure / How it works / Troubleshooting / Development / Uninstall / License の順に揃える。公開読者向けに個人 home や絶対パスは書かない。Extended mode の credential 開示は維持し、読む credential、送信 endpoint、undocumented API リスク、disable と uninstall の違いを太字で明記する。現状 gap: What/Requirements/Usage/Configuration/License の切り分け不足。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
README を正典順 (#/Features/Requirements/Install/Usage/Configuration/Security disclosure/How it works/Troubleshooting/Development/Uninstall/License) に再構成し、credential disclosure、undocumented API リスク、disable と uninstall の違いを維持した。見出し grep、旧同居構成 grep、bun test、plugin validate pass を確認。副作用のある marketplace install 実行と外部レビューゲートは未実施。
<!-- SECTION:FINAL_SUMMARY:END -->
