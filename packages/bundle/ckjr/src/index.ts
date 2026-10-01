/**
 * @ckjr/dsh-bundle-ckjr —— 创客匠人 (CKJR) 出厂插件 bundle。
 *
 * 本包的实体是 `cordis.patch.yml`：由 `dsh.bundle.patch` 清单字段声明，
 * profile composer 通过该字段解析并应用。本模块不承载任何运行时 API，
 * 它存在只是因为 `tsdown.config.ts` 要求 `packages/*/*` 下每个包都有
 * `lib/types/index.js` 入口（`entry: ['lib/types/{index,invariant,startup}.js']`），
 * 否则 monorepo 的 `build:lib` 会直接失败。
 * @module @ckjr/dsh-bundle-ckjr
 */

export {}
