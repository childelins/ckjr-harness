/**
 * 本 fork 的品牌常量（创客匠人 / CKJR）。改品牌只需改这个文件。
 *
 * 依据仓库根 BRAND_GUIDELINES.zh.md：第三方不得以 "DeepSeek Harness" 作为项目名
 * （注册商标），生态关联请用 "DSH" 缩写。故本 fork 使用自有品牌。
 */
export const BRAND = {
  /** 英文/ASCII 品牌标识：用于 exe 名、安装目录、appId 等对 ASCII 敏感的位置 */
  en: 'CKJR',
  /** 中文品牌标识：用于面向用户的界面文案 */
  zh: '创客匠人',
} as const
