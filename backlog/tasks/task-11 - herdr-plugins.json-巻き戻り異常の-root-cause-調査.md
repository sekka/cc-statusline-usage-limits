---
id: TASK-11
title: herdr plugins.json 巻き戻り異常の root cause 調査
status: To Do
assignee: []
created_date: '2026-07-21 23:54'
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

状態は手動修復済み (sekka.usage-limits@2eb38c6 / sekka.tab-title@d74891d 再インストール、daemon 再起動・cwd 検証済み) だが、herdr 再起動や converge で再発するリスクあり。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 巻き戻りの発生経路を特定する (herdr server の永続化タイミング / converge 処理の追跡)
- [ ] #2 再発防止策を実装または herdr 側へ issue 起票する
- [ ] #3 再現手順または再発しないことの確認方法を記録する
<!-- AC:END -->
