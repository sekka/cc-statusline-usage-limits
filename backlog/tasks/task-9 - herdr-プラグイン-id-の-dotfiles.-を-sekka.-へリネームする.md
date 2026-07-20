---
id: TASK-9
title: herdr プラグイン id の dotfiles.* を sekka.* へリネームする
status: To Do
assignee: []
created_date: '2026-07-14 03:24'
updated_date: '2026-07-20 10:30'
labels:
  - refactor
  - plugin
  - setup
dependencies: []
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 転記: dotfiles TASK-308 より (2026-07-20)。プラグイン群のクロスリポ管理を本リポの
> backlog に集約するため移設。実作業リポは sekka/herdr-tab-title・sekka/herdr-usage-limits
> と dotfiles (参照更新)。

herdr 自作プラグインの plugin id namespace が dotfiles.* (dotfiles.tab-title / dotfiles.usage-limits) になっているが、プラグインの本籍は sekka/* の独立公開リポでありdotfilesという namespace はおかしい。sekka.tab-title / sekka.usage-limits へ変更する。

ユーザー裁定 (2026-07-14): committed config への username 記載を避ける no-username 衛生より命名の正しさを優先し、sekka. prefix を明示的に許可。usage-limits 四兄弟 (tmux / herdr / cc-statusline 等) にも同種の namespace 概念があれば同様に sekka. へ揃えてよい (同日裁定)。

id の正はプラグイン repo 側 herdr-plugin.toml の id フィールド。setup/herdr-plugins.txt の plugin_id 列は herdr plugin list --json との照合キーで、ズレると is_registered が外れ毎回再インストールを試みる壊れ方をする — toml とマニフェストは同一コミット群で同期して変更する。

変更箇所:
- プラグイン repo (sekka/herdr-tab-title, sekka/herdr-usage-limits): herdr-plugin.toml の id、および自 id 参照 (--plugin dotfiles.tab-title 等のスクリプト・README)
- dotfiles 側の参照 (grep 'dotfiles\.tab-title|dotfiles\.usage-limits' で 2026-07-14 時点 6 ファイル): home/config/herdr/config.toml、home/config/herdr/plugins.json (実体キャッシュ)、home/.claude/hooks/herdr-claude-title.ts、setup/herdr-plugins.txt、docs/herdr-tmux-parity.md、scripts/system/update-plugin-pins.test.ts
- 移行手順: herdr plugin uninstall <旧id> → setup/27_herdr.sh 再実行で新 id 登録 (checkout ディレクトリ名 <id>-<hash> も新 id で作り直される)
- スコープ (ユーザー指示 2026-07-20): この namespace 概念を持つ**全ての**兄弟プラグインが対象。四兄弟調査は 2026-07-20 に完了:
  - tmux-usage-limits: TPM プラグインで id 概念なし (`@plugin 'sekka/tmux-usage-limits'` の repo 名が識別子) — ただし verify/manifest.json:2 に `dotfiles.usage-limits` の残骸あり → tmux-usage-limits TASK-9 で除去
  - cc-statusline-usage-limits: marketplace.json / plugin.json の name に dotfiles prefix なし。該当なし
  - herdr-tab-title 追加発見: claude-code-hook/herdr-claude-title.ts:6 のコメントが旧 id を記述 (herdr-tab-title TASK-6 に含める)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 sekka/herdr-tab-title と sekka/herdr-usage-limits の herdr-plugin.toml id が sekka.* になり、自 id 参照も更新されている
- [ ] #2 setup/herdr-plugins.txt の plugin_id 列が sekka.* に更新され、dotfiles 内の旧 id 参照 (hooks/config/docs/test) が残っていない (grep 0 hit)
- [ ] #3 herdr 上で旧 id が uninstall され新 id で登録済み、herdr plugin list --json で sekka.* を確認、tab-title/usage-limits が動作する
- [ ] #4 四兄弟の他リポ: tmux は verify/manifest.json の残骸除去 (tmux TASK-9) が完了、cc-statusline は該当なし記録済み (調査自体は 2026-07-20 完了)
- [ ] #5 四兄妹4リポを新 id で再インストール後、各プラグイン (tmux-usage-limits / herdr-usage-limits / herdr-tab-title / cc-statusline-usage-limits) が dotfiles リポ無しで動作することを live で確認している (TASK-233 から移設)
<!-- AC:END -->
