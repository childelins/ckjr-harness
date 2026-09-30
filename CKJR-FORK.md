# 创客匠人 (CKJR) 品牌化分支说明

本仓库是 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 fork，
用于发布面向创客匠人商家客户的桌面端。**本分支不做功能改造**，只做品牌化 + 一处更新源安全修正。

> 品牌化的合规依据：仓库根 `BRAND_GUIDELINES.zh.md` 明确要求第三方**不要**以 "DeepSeek Harness"
> 作为项目名（注册商标），生态关联用 "DSH" 缩写，并允许"基于 DSH 构建"这类描述性说明。
> 因此本 fork 使用自有品牌，不是违规，而是规范要求的做法。

## 基线

| 项 | 值 |
|---|---|
| 上游 | `git@github.com:deepseek-ai/deepseek-harness.git` |
| fork | `git@github.com:childelins/deepseek-harness.git` |
| 品牌化起点 | `639ed01539`（上游 `master`，DSH `0.2.0-rc.2`） |
| 分支 | `feature/ckjr-branding` |

## 品牌值的唯一来源

**`apps/desktop/src/locale.ts` 与 `apps/desktop/src/main.ts` 引用 `apps/desktop/src/brand.ts` 的 `BRAND`。**

```ts
export const BRAND = {
  en: 'CKJR',      // exe 名、安装目录、appId 等对 ASCII 敏感的位置
  zh: '创客匠人',   // 面向用户的界面文案
} as const
```

改品牌名 = 改这一个文件。**唯一的例外**是 `apps/desktop/scripts/electron-builder-config.mjs`：
该文件由 electron-builder CLI 在**纯 Node** 下加载（`package-target.ts`），而 `engines.node`
允许 Node 22.19，无法 import TypeScript，所以那里有一个模块内的 `const BRAND_EN = 'CKJR'`，
注释已注明必须与 `brand.ts` 保持一致。**改品牌名请改两处。**

## 改了哪些东西（78 文件，+279/−365）

| 类别 | 内容 |
|---|---|
| 外壳文案 | `src/locale.ts`（12 键 × en/zh）、`src/main.ts` 的 `applicationName`、`src/welcome-backend.ts` |
| 应用身份 | `electron-builder-config.mjs`：`appId`（由 `DSH_DESKTOP_APP_ID` 提供）、`productName: ckjr-harness`、`artifactName: CKJR-Harness-…`、协议名、macOS 麦克风用途说明 |
| 安装包 | `installer/strings.nsh`（6 条中英文）、`installer/extract-report.h` |
| 图标 | `resources/icon{,-windows,-macos}.png`（1024×1024，取自 CKJR 的 `icon.icns` 中 `ic10`）、三个 `.svg`、`tray-windows.ico` |
| 发布链路 | 产物基名 `deepseek-harness-` → `CKJR-Harness-`（`desktop-build-version-discovery.ts`、`desktop-upload-plan.ts`、`package-macos.ts`、`installed-update-distribution.ts`），否则打包产出的文件上传与更新发现都对不上 |
| 启动脚本 | `cli/dsh`、`cli/dsh.cmd` 指向新 exe 名（**命令名仍是 `dsh`，未改**） |
| Web 端 | `apps/web/public/manifest.webmanifest`（PWA 名）、`favicon.svg` / `favicon-dark.svg` |
| 测试快照 | `tests/expected/**` 全部同步，否则套件必挂 |
| 更新源（安全修正） | `scripts/desktop-auto-update-environment.mjs` |

## ⚠️ 更新源：这是本次唯一的行为性改动，务必了解

上游把生产更新源**硬编码**为 `https://download.deepseek.com`。若不改，品牌化版本会自动升级成
**官方原版**，把商家机器上的品牌、账号体系与计费链路静默覆盖。

本分支改为与 `test` 同形的环境变量，**并且 fail-closed**：

```js
production: { originEnvName: 'DOWNLOAD_PROD_ORIGIN', fixedOrigin: undefined, … }
```

- 生产打包**必须**提供 `DOWNLOAD_PROD_ORIGIN`（绝对 HTTPS origin、不带路径），否则打包直接失败。
- 永远不会回落到官方源。
- 上传仍走 `DOWNLOAD_{TEST,PROD}_COS_*`（腾讯 COS），bucket 与 `dsh-desk/` 前缀未动。

## 上游同步流程

```bash
git remote add upstream git@github.com:deepseek-ai/deepseek-harness.git   # 一次性
git fetch upstream --tags
git checkout -b sync/upstream-$(date +%Y%m%d) feature/ckjr-branding
git rebase upstream/master
```

冲突热点就是上面表格里的文件，其中**最容易冲突**的是：

1. `src/locale.ts` —— 上游会不断加文案，几乎必冲突。解决原则：保留上游新增键，把品牌相关的
   12 个键改回 `BRAND.en` / `BRAND.zh` 引用。
2. `tests/expected/**` —— 跟着 `locale.ts` 一起变。**解决冲突后跑一次套件**，失败信息会直接
   指出哪些快照没跟上。
3. `electron-builder-config.mjs` —— 上游若改了 `productName` / `artifactName` / 协议名，
   把我们的值贴回去。
4. `desktop-auto-update-environment.mjs` —— 上游若重新引入 `fixedOrigin`，**必须再改回
   `DOWNLOAD_PROD_ORIGIN`**，否则品牌化会被官方更新覆盖。这是最危险的一条。

## 已知待办

- [ ] **跑一次测试套件**。品牌化过程**没有跑过任何测试**：`corepack pnpm install --frozen-lockfile`
      在 1370/1392 个包处超时（npmmirror 反复 `error (23)`），没有 `vitest` 可执行文件。
      已通过 Node 24 类型剥离**实际求值 `locale.ts`** 并与 17 个快照交叉核对（全部通过），
      但**这不等于套件通过**。装好依赖后请执行套件。
- [ ] **重新生成托盘图标**：`tray-windows.ico` 目前是临时替身（直接用了 CKJR 的 `icon.ico`），
      因为 `pnpm run render:tray-icon` 依赖安装失败而缺 `sharp`。
      装好依赖后在 `apps/desktop` 下跑 `pnpm run render:tray-icon`，按 `TRAY_ICON_SIZES` 从新 SVG 重新生成。
- [x] ~~zh 欢迎语品牌名前的空格~~ 已修（`welcomeTaglineBefore` 由 `'欢迎使用 '` 改为 `'欢迎使用'`）。
- [ ] **`welcomeDescription`** 仍是上游宣传语（`Build potential. Explore intelligence.` /
      `组装无限可能，共探智能上限`）。不含 "DeepSeek" 字样，不涉及商标，但确实是官方文案——
      要换成创客匠人自己的宣传语请改 `locale.ts` 的 `welcomeDescription` 并同步 `tests/expected/welcome/*`。
- [ ] **Windows 注册表键**：`scripts/command-path.ps1` 仍用 `Software\DeepSeekHarness\Command`
      与互斥体 `Global\DeepSeekHarness.Command.<sid>`（`tests/fixtures/command-path.ps1` 同名）。
      不影响用户可见文案，但注册表里能看到 DeepSeek 字样，且与官方版**可能争用同一个键**。
      改名属行为性变更（涉及已注册命令的迁移），未擅自改。
- [ ] **文档过期**：`apps/desktop/README{,.zh}.md`、`README.i18n.yaml` 仍写旧品牌与旧产物名。
      它们是上游项目文档，本次未动。
- [ ] `.env.*.example` 里 `DSH_DESKTOP_APP_ID=com.ckjr.harness.desktop` 是示例值，
      正式发布前请确认（**刻意不同于** `com.ckjr.agent.desktop`，两者是不同产品）。
