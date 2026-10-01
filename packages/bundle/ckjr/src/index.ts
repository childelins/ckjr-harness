/**
 * @ckjr/dsh-bundle-ckjr —— 创客匠人 (CKJR) 出厂插件 bundle。
 *
 * 本包的实体是 `cordis.patch.yml`：由 `dsh.bundle.patch` 清单字段声明，
 * profile composer 通过该字段解析并应用。本模块不承载任何运行时 API。
 *
 * 它存在只是为了满足 tsdown 的 workspace 构建：入口写成
 * `lib/types/{index,invariant,startup}.js`，packages 下每个包都必须至少命中一个，
 * 否则 monorepo 的 `build:lib` 会失败。写本注释时注意不要出现「星号紧跟斜杠」的
 * 通配路径写法，那会提前闭合块注释并把后面的文字当成代码。
 * @module @ckjr/dsh-bundle-ckjr
 */

export {}
