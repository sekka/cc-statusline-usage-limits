# Changelog

## [1.0.7](https://github.com/sekka/cc-statusline-usage-limits/compare/v1.0.6...v1.0.7) (2026-07-22)


### Bug Fixes

* limits-fetch の失敗理由を旧実装に揃える ([e71ca47](https://github.com/sekka/cc-statusline-usage-limits/commit/e71ca47d84c258f95899146da28a63f91ae8ff9e))

## [1.0.6](https://github.com/sekka/cc-statusline-usage-limits/compare/v1.0.5...v1.0.6) (2026-07-20)


### Bug Fixes

* cache の未来 timestamp/lastAttempt を無害化し表示凍結を防ぐ ([8058f67](https://github.com/sekka/cc-statusline-usage-limits/commit/8058f67d5d941deef0a4fd79dc775b0ca4b2380b))
* Extended mode に同意マーカーを要求する ([1ac1fb0](https://github.com/sekka/cc-statusline-usage-limits/commit/1ac1fb088295b7c9b458486bf46436e914df51e6))
* SessionStart sync から limits-fetch.mjs 配備を外し opt-in を実効化する ([8ccc0fa](https://github.com/sekka/cc-statusline-usage-limits/commit/8ccc0faa21ad524d407a0eabe4cb15ae86172cd4))
* stale 表示の経過分を下限で丸める ([1c44f4e](https://github.com/sekka/cc-statusline-usage-limits/commit/1c44f4e436443db6cab4c6c177a8f3098f6e2e9e))
* 毒 cache 修正と Extended mode の opt-in 化 (M1) ([1e3aff3](https://github.com/sekka/cc-statusline-usage-limits/commit/1e3aff3ec05e41741dab4c72dba73b2e7521a36d))

## [1.0.5](https://github.com/sekka/cc-statusline-usage-limits/compare/v1.0.4...v1.0.5) (2026-07-20)


### Bug Fixes

* 低使用率時のゲージ色を gray から white に変更 ([320e7d3](https://github.com/sekka/cc-statusline-usage-limits/commit/320e7d3407349537d984084552b8fc79c2d5e0f5))
* 低使用率時のゲージ色を gray から white に変更 ([ff8174e](https://github.com/sekka/cc-statusline-usage-limits/commit/ff8174e75de96d5fca29c1c85bd727bef6712d92))

## [1.0.4](https://github.com/sekka/cc-statusline-usage-limits/compare/v1.0.3...v1.0.4) (2026-07-13)


### Bug Fixes

* keychain token 取得で token 無し JSON を token として誤返却しない ([9672655](https://github.com/sekka/cc-statusline-usage-limits/commit/9672655fd8d3ccc7e3c8f670d28bfd98a180fc39))
* sync.sh が存在しない src を silent skip せず exit 1 する ([39c29e7](https://github.com/sekka/cc-statusline-usage-limits/commit/39c29e70fc4d41318a54d73e65e7dd3a193e1e14))
* ゲージ・閾値・reset 表記を元の canonical デザインに揃える ([6c818df](https://github.com/sekka/cc-statusline-usage-limits/commit/6c818df427c1910f908dfad51cd08620c18b212e))

## [1.0.3](https://github.com/sekka/cc-statusline-usage-limits/compare/v1.0.2...v1.0.3) (2026-07-13)


### Bug Fixes

* limits fetcher も statusline と一緒に同期 ([d27403c](https://github.com/sekka/cc-statusline-usage-limits/commit/d27403cfa8c88e182a73fdce258a22550e50d50f))
* statusline limits を旧表示に揃える ([5cd7a9f](https://github.com/sekka/cc-statusline-usage-limits/commit/5cd7a9f46c0ddbb3894e102f7902d1ff77a00c91))
* 旧 statusline 完全パリティ + limits-fetch の deploy 漏れ修正 ([cf63367](https://github.com/sekka/cc-statusline-usage-limits/commit/cf633675e5fc319a72abd7956bef480e0cb53a14))

## [1.0.2](https://github.com/sekka/cc-statusline-usage-limits/compare/v1.0.1...v1.0.2) (2026-07-13)


### Bug Fixes

* statusline limits の装飾を旧表示に揃える ([6b51787](https://github.com/sekka/cc-statusline-usage-limits/commit/6b51787385cb0e116b0429be7b7ec7aa14f60aad))

## [1.0.1](https://github.com/sekka/cc-statusline-usage-limits/compare/v1.0.0...v1.0.1) (2026-07-13)


### Bug Fixes

* reset 表示を絶対時刻付きに戻す ([fcdade5](https://github.com/sekka/cc-statusline-usage-limits/commit/fcdade5e4b3cc14df5f60b276d268d79e60e3d64))

## [1.0.0](https://github.com/sekka/cc-statusline-usage-limits/compare/v0.2.0...v1.0.0) (2026-07-13)


### Miscellaneous Chores

* v1.0.0 リリースを発行する ([535fbcb](https://github.com/sekka/cc-statusline-usage-limits/commit/535fbcb376ee5fd6a10eae1f1234c35e5aa36f51))

## [0.2.0](https://github.com/sekka/cc-statusline-usage-limits/compare/v0.1.0...v0.2.0) (2026-07-13)


### Features

* statusline usage limits plugin を公開リポ化 ([0f5cf4b](https://github.com/sekka/cc-statusline-usage-limits/commit/0f5cf4bb0905ebdf043ead3949d32b525e3c1403))


### Bug Fixes

* Keychain JSON から statusline token を抽出 ([25c2773](https://github.com/sekka/cc-statusline-usage-limits/commit/25c2773682f21186d390e11bfaa86f0e3e1dd4d2))
* statusline cache schema を正典形に合わせる ([f39cfd3](https://github.com/sekka/cc-statusline-usage-limits/commit/f39cfd38dc86ab4921aae2c9923ca3141d13dfcb))
* statusline plugin hook 定義を一本化 ([f0c994c](https://github.com/sekka/cc-statusline-usage-limits/commit/f0c994c00092f65495be77ca4d20a7b5ecb7e4a6))
