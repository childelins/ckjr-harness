# 创客匠人 (CKJR) 品牌化分支说明

本仓库是 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 fork，
用于发布面向创客匠人商家客户的桌面端。品牌化本身**不做功能改造**，只做品牌化 + 一处更新源安全修正；
`feature/ckjr-bundled-plugins` 在此基础上多了一件事：**把创客匠人插件做成出厂预装**
（见下一节）。

> 品牌化的合规依据：仓库根 `BRAND_GUIDELINES.zh.md` 明确要求第三方**不要**以 "DeepSeek Harness"
> 作为项目名（注册商标），生态关联用 "DSH" 缩写，并允许"基于 DSH 构建"这类描述性说明。
> 因此本 fork 使用自有品牌，不是违规，而是规范要求的做法。

## 基线

| 项 | 值 |
|---|---|
| 上游 | `git@github.com:deepseek-ai/deepseek-harness.git` |
| fork | `git@github.com:childelins/ckjr-harness.git` |
| 品牌化起点 | `639ed01539`（上游 `master`，DSH `0.2.0-rc.2`） |
| 已同步到的上游 | `5badb15009`（DSH `0.2.1-alpha.1`，2026-10-08 合并：落后 266 / 领先 44） |
| 分支 | `master`——fork 的默认分支，品牌化与出厂插件现在都在它上面（`feature/ckjr-*` 是历史分支） |

## 出厂预装创客匠人插件（`feature/ckjr-bundled-plugins`）

品牌化只改外壳，装完安装包仍要商家自己 `dsh plugin add`；本分支把三个插件变成出厂内容，
商家装完即可直接登录。

### 四个位置的分工

| 位置 | 内容 | 归谁 |
|---|---|---|
| `childelins/dsh-ckjr-plugins` 仓库 | 各 CKJR 插件包及其 `cordis.patch.yml` | 另一个仓库，**唯一真源** |
| `<fork>/ckjr-plugins/` | 构建时对该仓库的检出（CI 用 `actions/checkout` 放到这个固定路径） | 不是本 fork 的内容，已写进 `.gitignore` |
| `packages/bundle/ckjr/` | 本 fork 的出厂 bundle `@ckjr/dsh-bundle-ckjr`，一个纯 patch 载体 | 本 fork |
| `packages/bundle/ckjr/cordis.patch.yml` | **生成物**：扫描 `ckjr-plugins/*` 合并而成 | 由脚本生成，勿手工编辑 |

### 为什么需要一个 bundle，以及为什么它的补丁是生成的

profile 对每个 bundle 只加载它自己 `dsh.bundle.patch` 指向的文件——**bundle 的依赖不会各自贡献
patch 层**；而 profile 的 `bundles` 名单又必须是 `packages/*/*` 下的包（`scripts/verify-default-product-isolation.ts`
的目录 glob 不含 `ckjr-plugins/*`）。两者叠加，就需要一个 fork 内的 bundle 把各插件的 patch 合成一份。

**这份合成补丁是生成物**，由 `apps/desktop/scripts/generate-ckjr-bundle-patch.ts` 扫描
`ckjr-plugins/*/cordis.patch.yml` 生成，于是：

- 在 `dsh-ckjr-plugins` 里**新增插件不用改本 fork 的任何文件**（打包流程会自动重新生成与重新打包）；
- 改插件 patch 也不用同步第二处；万一生成物过期，`--check` 会判定不一致并**直接失败**，
  而不是静默产出行为不对的安装包。

### 数据流（自下而上）

1. `pnpm-workspace.yaml` 增加 `ckjr-plugins/*`，把插件检出纳入工作区。
2. `packages/boot/app-boot/src/profile.ts` 的 `PROFILE_TEMPLATES.web.bundles` **末尾**加上
   `@ckjr/dsh-bundle-ckjr`：桌面端 profile 的 bundle 列表就来自这里（`apps/desktop/src/project-manager.ts`）。
   必须排在最后——各插件的 disable 按 id 定位 `dsh-base` / `dsh-web-app` 已经 insert 的行。
3. `apps/desktop/scripts/package-target.ts` 先调 `generateCkjrBundlePatch()` 按当前检出重算合并补丁，
   再把 bundle 与 `ckjr-plugins/` 下**扫到的每个**插件包用 `pnpm pack` 打进 `packed/ckjr`
   （`desktop-build-paths.mjs` 的 `packedCkjr`）。它们不是 `dsh` 发布家族的成员，所以不走 `release:pack`。
   缺检出、或一个插件都没扫到时直接报错，不产出没有插件的安装包。
4. `apps/desktop/scripts/prepare-package-set.ts` 把打包进来的**每个 `@ckjr/` 包**都当闭包根
   （按包名前缀识别，不写死清单），闭包因此选出全部插件与 bundle（以及它们的 `@deepseek-ai/*` peer），
   写进 `desktop-packages.json`。一个 `@ckjr` 包都没有时直接报错。
5. `apps/desktop/src/project-manager.ts` 把这个集合变成出厂运行时工程的 `file:` 依赖，
   于是 `loadProfileDirectory` 能解析到 bundle，patch 生效。

### 在 dsh-plugins 里新增一个插件

1. 新目录里放 `package.json`（声明 `dsh.bundle.patch`）与 `cordis.patch.yml`；
2. 推送到 `main`。

**fork 侧不需要改任何文件。** 打包时会自动扫到它、合并它的 patch、`pnpm pack` 它，
并把它作为闭包根纳入出厂包集合。

想在看构建前先确认合并结果：

```bash
pnpm --filter @deepseek-ai/dsh-desktop run generate:ckjr-bundle-patch
pnpm --filter @deepseek-ai/dsh-desktop run generate:ckjr-bundle-patch -- --check
```

### 出厂品牌与隐私默认：`dsh-ckjr-brand`

第四个出厂插件，**不参与登录链路**（去掉它登录照样能跑），只做两件"上游有开关、但不该让
商家用户自己去关"的事。两条都**只在插件层**（dsh-plugins + 生成出来的补丁层）实现，
**没有改 fork 的任何一行上游代码**。

| 改动 | 用户可见效果 | 为什么插件层能表达 / 为什么别的做法不行 |
|---|---|---|
| 系统提示词第一句 `You are an AI agent powered by DeepSeek Harness.` → `You are an AI agent powered by CKJR Harness.` | 新会话的身份句是 CKJR 品牌 | 上游那句是**写死的字面量**（`packages/core/system-prompt/src/index.ts:429`），句子里没有产品名插值；`DSH_CLIENT_TITLE` 只喂浏览器 `<title>`（`apps/web/vite.config.ts:23`），与提示词不在一条链上。**"关掉 `includeHarnessIdentity` + 把品牌句写进 `personaPrefix`"这条路不可行**：`personaPrefix` 座位会被 agent preset 遮蔽（`packages/bundle/web-app/presets/standard.patch.yml:11-15` 在每个 preset 的 agent scope 里挂 `dsh-persona`），而 Web 新会话正是走 preset。插件能用的接缝是 `system-prompt/assemble` waterfall，上游产品插件本来就在用它（如 `packages/context/session-reference/src/index.ts:127`）。 |
| 出厂 `session-log-deepseek` 行 `disabled: true` | Session Log **默认关闭**，且设置 → 通用设置里**不再显示**那一项 | disable 一行同时满足两条：行不加载就不存在上传路径；浏览器侧那一行必须靠 `ctx.configForms.whileServed(['session-log-deepseek'], …)` 才注册（`packages/client/ui-settings-session-log/src/client/index.ts:36-37`），而行被 disable 后命名空间不再被服务（`packages/settings/settings/src/index.ts:303-307` 只报 fiber 处于 `ACTIVE` 的条目）。这是**上游支持的机制**，不是遮蔽 hack：`packages/client/ui-settings/README.md:38` 写明 "A deployment that never composed the owner therefore shows no trace of the page"，上游自己的 `packages/client/ui-settings-session-log/tests/apply.client.spec.ts:12-53` 就断言"命名空间不被服务时那一行不存在"。 |

顺带一条**已核实的事实**（不是猜测）：不 disable 时，会话日志**也会发给 CKJR 网关**，
而不只是发给官方 API——`dsh_session_log` 字段由 DeepSeek Messages 适配器统一注入
（`packages/llm/llm-deepseek/src/host.ts:36` 的 `prepareExtensions`），而 `dsh-ckjr-llm`
注册的 `ckjr` 路由复用的正是这个适配器（`registerDeepSeekProvider`），且该扩展的判据里
没有 provider 过滤。

**刻意没做**：`session-telemetry-otel`（`packages/bundle/base/cordis.patch.yml:204`）是**另一条**
独立上传路径，默认 `FEEDBACK_ONLY`、默认发往 `dsh-otel-collector.deepseeksvc.com`，而且它
**没有设置项**。关它属于行为性变更，等明确要求再动。

**验证**：`node dsh-ckjr-brand/verify-brand-prompt.mjs`——16 项断言，跑的是 fork **已编译的**
`SystemPrompt` 与 Loader **真正的** `applyEntryPatches`，含"preset 确实遮蔽 personaPrefix"的
反证。未验证项见该插件 README。

> ⚠️ **新增插件后必须重新生成** `packages/bundle/ckjr/cordis.patch.yml`：
>
> ```bash
> DSH_CKJR_PLUGINS_ROOT=<dsh-plugins 检出> pnpm --filter @deepseek-ai/dsh-desktop run generate:ckjr-bundle-patch
> ```
>
> 它是生成物，但**也要提交**（否则 `--check` 与 CI 判定不一致）。打包流程会在 `pnpm pack`
> 之前自动重算，所以漏了不会产出错包，只会让检出的生成物过期。

> 🔴 **上游同步时最容易被抹掉的两行**：`packages/bundle/ckjr/cordis.patch.yml` 是 fork 独有文件，
> 上游不会碰它；但如果**从一个不含 `dsh-ckjr-brand` 的插件检出**重新生成，`session-log-deepseek`
> 的 `disabled: true` 与 `ckjr-brand` 的 insert 行会**静默消失**（生成器只扫目录，不读清单）。
> 发现生成物里少了这两行时，先确认 `DSH_CKJR_PLUGINS_ROOT` 指向的检出里有 `dsh-ckjr-brand/`，
> 再重跑上面那条命令——**不要**去改 fork 的上游文件。

另附一条已验证的**结论**，避免以后白忙：这两项改动**不需要动任何 fork 测试快照**。
`apps/web/tests/scaffold.ts:755` 给自己搭的 profile 只有 `dsh-base` + `dsh-web-app`
（`@ckjr/dsh-bundle-ckjr` 不在里面），所以 `apps/web/tests/replay-round-trip.e2e.ts:224`
那句 DeepSeek 文案断言、`apps/web/tests/session-log-upload.e2e.ts` 与
`apps/web/tests/expected/settings-chrome/*.expected.md` 里的那一行**都照旧通过**。

### 限制与已知待办

- **`packages/test-support/client-runtime/src/assembly/bundle-roster.ts` 里的
  `WEB_PROFILE_BUNDLES` 仍是旧的两项**：它是整客户端测试用的固定名单，改成三项需要那个包能解析
  到 `@ckjr/*`，本分支没动，代价是整客户端测试不再反映真实的 web profile。
- **安装器品牌素材的分辨率受源图限制**：`apps/desktop/installer/assets/*.png` 目前由
  `lecturercs.myckjr.com/favicon.ico`（只有 32×32）放大生成，在小尺寸显示尚可，
  但应用图标（exe/任务栏，需要 256px 以上）没有跟着换。拿到高清原图后重新生成即可。

## Harness 主目录：`~/.ckjr`

**本 fork 的桌面端默认使用 `~/.ckjr`，与官方的 `~/.dsh` 分开。** 由
`apps/desktop/src/fork-identity.ts` 在模块加载时把默认值写回 `$DSH_HOME`；该模块在
`main.ts` 的 import 列表里排第一位，确保早于任何解析 Harness 路径的模块体执行。
写回环境变量而不是只改桌面端自己的解析，是因为桌面端解析出的路径会通过继承的环境变量
传给它的 Host 子进程——设定一次，desktop 与它拉起的 runtime 就落在同一个主目录上。

分开的两个原因：

1. **共用会让两个应用读写同一个 profile 与会话**：官方实例正在运行时，CKJR 实例会接到
   同一个 runtime 上，表现为「点开 CKJR 却进了官方应用」。
2. **共用会让已存在的 profile 挡住本 fork 的 bundle 名单**：`initProfile` 只在 profile
   不存在时创建，所以从官方版升级上来的机器会保留官方的 bundle 列表，CKJR 的插件层永远
   不生效。主目录分开后这一条自然消失。

`$DSH_HOME` 显式设置时一律优先——开发与测试照旧可以指向隔离目录。


## 品牌值的唯一来源

**`apps/desktop/src/locale.ts` 与 `apps/desktop/src/main.ts` 引用 `apps/desktop/src/brand.ts` 的 `BRAND`。**

```ts
export const BRAND = {
  en: 'CKJR',      // 应用名、About 对话框、退出确认标题等
  zh: '创客匠人',   // 面向用户的界面文案
  menu: 'CKJR Harness',  // 托盘菜单与窗口标题这类"完整产品名"
} as const
```

### 命名大小写规范（别漂）

品牌名有两种形态，**用途不同、写法不同**，改动前先对号入座：

| 用途 | 写法 | 出现在哪 |
|---|---|---|
| **面向用户的产品名** | `CKJR Harness` | 托盘菜单、窗口标题、UI 文案、About |
| **技术标识符** | `ckjr-harness` | 包名、`ckjr-harness.exe`、appId、文件名、路径 |
| **单独的品牌 / 公司名** | `CKJR` / `创客匠人` | `BRAND.en` / `BRAND.zh` |

`BRAND.menu` 就是为第一行存在的：托盘与窗口标题要的是「完整产品名」，
不是 `BRAND.en`（那只有 `CKJR`）。**不要在各处再写第二份字面量**。

窗口标题的产品名来自**上游的品牌化旋钮** `DSH_CLIENT_TITLE`
（`scripts/client-build-environment.ts` 的 `OFFICIAL_CLIENT_BUILD_ENVIRONMENT`），
由 `packages/client/ui-layout` 的 `AppFrame` 读 `process.env` 并交给 `DocumentTitle`
拼成 `会话名 — 产品名`。它**不是** Electron 主进程设的——改主进程没用。

改品牌名 = 改这一个文件。**唯一的例外**是 `apps/desktop/scripts/electron-builder-config.mjs`：
该文件由 electron-builder CLI 在**纯 Node** 下加载（`package-target.ts`），而 `engines.node`
允许 Node 22.19，无法 import TypeScript，所以那里有一个模块内的 `const BRAND_EN = 'CKJR'`，
注释已注明必须与 `brand.ts` 保持一致。**改品牌名请改两处。**

## 欢迎/登录窗口：字标、API Key 入口、窗口标题

欢迎窗口（登录窗）是与主界面**分开的一个渲染进程**：主进程用
`loadFile(join(app.getAppPath(), 'renderer', 'welcome.html'))`（`src/welcome-window.ts`）直接加载
`renderer/welcome.html` + `lib/welcome/welcome.js`（由 `src/client/welcome.tsx` 打包），
文案取 Electron 外壳自己的 `src/locale.ts`，字标是 app 包里的静态资源。

**它不在 DSH 的 profile / 插件图里**，所以这三处只能改 fork：插件层
（`cordis.patch.yml` 的行 + Host/Client 插件）组装的是**登录之后**的 Harness 宿主与网页客户端；
欢迎窗口既没有座位（slot）也没有可 patch 的行——插件注册的那些座位（`shell.overlay` 门禁、
`sidebar.footer.action` 账号区等）全部渲染在主界面里，碰不到另一个渲染进程的 DOM 与静态资源。

| 位置 | 改动 | 为什么插件层做不到 |
|---|---|---|
| `renderer/assets/welcome-brand.svg` | 上游字标（鲸鱼 + `deepseek` + `HARNESS` 方块）→ CKJR 字标 | 静态资源，由 `welcome.html` 里 `<img src="assets/welcome-brand.svg">` 引用，与插件系统无关。本 fork 没有 CKJR 字标的矢量原稿（安装器只有方形 `brand.png`，铺进 472×40 的宽字标位会变形），所以用**文字**渲染并自带 `@media (prefers-color-scheme: dark)` 配色——`<img>` 里的 SVG 拿不到宿主页面的 CSS 变量，必须自带 `<style>`（上游那把字标也是这么做的） |
| `src/client/WelcomePage.tsx` | 删掉 entry 页的 `#api-key` 与登录失败页的 `#auth-api-key` 两个按钮（key 页因此不可达） | 这两个按钮是欢迎窗口自己的 JSX；patch 层的三种操作（disable / 覆盖 config / insert）只能作用于行，删不掉另一个渲染进程 JSX 里的一行 |
| `src/locale.ts` | `welcomeTitle` 改用 `BRAND.menu`（原 `BRAND.en` / `BRAND.zh`） | 窗口标题由 `welcome-window.ts` 的 `BrowserWindow.title` 与 `WelcomePage` 的 `document.title` 从外壳字典取；插件层没有改写它的接缝。Windows 隐藏标题栏后，这个字符串就是**任务栏悬停预览与 Alt-Tab 里显示的文字**，按命名规范必须是 `CKJR Harness` |
| `src/locale.ts` | `aboutProduct`、`welcomeBrand` 改用 `BRAND.menu` | 同一条：About 面板的产品名与字标的 `alt` 都由外壳字典提供，属于「完整产品名」位置 |

**刻意保留**（属"公司名/品牌"而不是"产品名"位置，按 `brand.ts` 的口径继续用 `BRAND.zh`）：
`welcomeTaglineBrand`（欢迎语「欢迎使用创客匠人」）、`aboutMenu`、`hideApplication`、`quitTitle`、
`startupFailed`、`updateTitle`。要改成 `CKJR Harness` 是产品口径变更，不是修 bug。

**上游同步注意**：`welcome-brand.svg` 是 fork 独有内容（上游会改回鲸鱼字标）；
`WelcomePage.tsx` 的 `entry-actions` 与 `auth-actions` 两处按钮列表、
`locale.ts` 的四个键是冲突热点。改文案后要同步
`apps/desktop/tests/expected/welcome/*.expected.txt`（其中 6 个文件第一行是
`document.title`，即 `welcomeTitle`）。

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
| 更新源（安全修正） | `apps/desktop/scripts/desktop-auto-update-environment.mjs` |

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

## 设置 → 模型：没有 curated 字段的 provider 不再有「编辑」与占位编辑器

**现象**：设置 → 模型的「创客匠人」卡片上，除了我方 `dsh-ckjr-client-ui` 通过
`settings.models.provider-card` 座位渲染的卡片（可用模型 + 刷新），还挂着上游那一块：
右上角「编辑」按钮，以及点开后只有一句
`其余字段在 cordis.patch.yml 中，请直接编辑对应段。（ckjr-llm）` 加 [取消][保存] 的占位编辑器
（「保存」本来就是灰的）。

### 为什么插件做不到，必须改 fork

1. **`settings.models.provider-card` 是插入式座位，不是替换式。**
   `packages/client/ui-settings-models/src/client/ModelsSection.tsx` 里
   `renderSlot('settings.models.provider-card', …)` 插在卡片头与编辑器**之间**；
   slot 机制只带一个 `fallback`（没有贡献者时渲染什么），**没有"有贡献者就不渲染上游卡"的能力**。
   所以插件只能往卡片里**加**东西，压不掉上游卡的任何一部分。
2. **「编辑」按钮无条件渲染。** 同一文件里只有「删除」受 `row.removable` 控制，
   「编辑」没有任何开关；patch 层的三种操作（`disabled` / 覆盖 `config` / `insert`）
   也删不掉上游 JSX 里的一行。
3. 于是这属于《CKJR-架构决策-改哪里.md》第三节那类"插件够不着"的改动：**只能改上游源码**。

### 改法（通用规则，不硬编码 ckjr-llm）

**布局为 `unknown` 的 provider：不显示「编辑」按钮，也不渲染编辑器。**
`ProviderEditor.tsx` 的 `layoutOf(ns)` 只认 `llm-deepseek` 与 `llm-pi-ai`，
其余（包括我们的 `ckjr-llm`）都是 `unknown` → 卡片正文只剩那句 `cordis.patch.yml` 提示，
且 `submitDisabled` 里的 `layout === 'unknown'` 让「保存」永远点不亮。
即 **`unknown` = 这张卡没有任何可编辑字段**，给它一个"点了也存不了"的编辑按钮本来就是上游的小瑕疵；
改成不显示，对上游也说得通（规则里没有 ckjr 字样）。

- `ProviderEditor.tsx`：新增导出的 `providerLayout(provider, ns)` 与
  `hasCuratedFields(provider, ns)`，把组件里原来那句 `accountProvider ? 'deepseek' : layoutOf(ns)`
  收敛成**唯一一处判断**，避免两处各写一份而漂移。
- `ModelsSection.tsx`：行渲染处用 `hasCuratedFields(target.provider, target.settingsNs)`
  决定是否渲染「编辑」按钮、该行是否允许展开编辑器（`editing` 里残留的目标也不会再复活那张卡）；
  首次运行姿态（`needsSetup`）的 setup 卡对这类 provider 也不再走——
  否则那张空卡会以"整行"的形式出现。
- **`deepseek-account` 特例必须保留**：账号路由的 settings namespace 是可配置的 Cordis entry id
  （默认 `llm-deepseek-account`），`layoutOf` 对它只会答 `unknown`。
  因此判断**必须带上路由 id**（`providerLayout` 先判 `provider === 'deepseek-account'`）；
  只按 ns 判会连官方「DeepSeek 账号」卡的编辑器一起禁掉。

### 同步上游时注意

- 这是**被 fork 改过的上游文件**，冲突热点是：
  `ModelsSection.tsx` 的行渲染（`hasCuratedFields` 的两个使用点）与
  `ProviderEditor.tsx` 的 `layoutOf` / `providerLayout`。
- 若上游把 `layoutOf` 改成表驱动、新增 curated layout、或给账号路由改名：
  **保住 `deepseek-account` 这条特例**，并确认 `unknown` 仍是"没有可编辑字段"的意思；
  一旦上游给 `unknown` 补上真实字段，这条规则就要重新评估（那时应改为按字段能力判断）。
- 若上游自己给「编辑」加了开关（例如 `row.editable`）：**优先改用上游的开关并删掉这里的规则**，
  让这个 fork 改动退场。
- 同包测试 `tests/components.client.spec.tsx` 的
  `knows which providers have a curated field set to edit` 与
  `leaves a provider whose namespace has no curated fields to its seat card`
  会直接指出规则是否被改坏。

## 上游同步流程

```bash
git remote add upstream git@github.com:deepseek-ai/deepseek-harness.git   # 一次性
git fetch upstream --tags
git merge upstream/master          # 在 master 上直接合并：不改写历史，master 对已 clone 的人是快进
```

先干跑一遍拿冲突清单，比合并后撞上再回退省事（不碰工作区、不建提交）：

```bash
git merge-tree --write-tree --name-only --no-messages master upstream/master
```

> 2026-10-08 实测：落后 266 / 领先 44，干跑只报 **1 个**冲突文件
> （`apps/desktop-host/src/index.ts` 的端口行，已按下面第 7 条退场）。`locale.ts`、
> `tests/expected/**`、`electron-builder-config.mjs`、`desktop-auto-update-environment.mjs`
> 那一批当时**都没有**冲突——它们是历史悠久的热点，不是每次必冲突。
>
> 想要线性历史就换成 `git checkout -b sync/upstream-$(date +%Y%m%d)` 再
> `git rebase upstream/master`；代价是 44 个提交逐个重放，且覆盖 master 必须
> `--force-with-lease`。

冲突热点就是上面表格里的文件，其中**最容易冲突**的是：

1. `src/locale.ts` —— 上游会不断加文案，几乎必冲突。解决原则：保留上游新增键，把品牌相关的
   键改回 `BRAND` 引用。**注意分两类**：多数用 `BRAND.en` / `BRAND.zh`，
   但**托盘菜单与窗口标题那几条必须用 `BRAND.menu`（= `CKJR Harness`）**，
   与 `scripts/client-build-environment.ts` 的 `DSH_CLIENT_TITLE` 保持一致；
   若一律改回 `BRAND.en`/`BRAND.zh`，托盘会退化成缺产品名的写法。
   `BRAND` 的字段会随品牌需求增加（如 `menu`），同步前先看一眼 `brand.ts` 的当前形状。
2. `tests/expected/**` —— 跟着 `locale.ts` 一起变。**解决冲突后跑一次套件**，失败信息会直接
   指出哪些快照没跟上。
3. `electron-builder-config.mjs` —— 上游若改了 `productName` / `artifactName` / 协议名，
   把我们的值贴回去。
4. `desktop-auto-update-environment.mjs` —— 上游若重新引入 `fixedOrigin`，**必须再改回
   `DOWNLOAD_PROD_ORIGIN`**，否则品牌化会被官方更新覆盖。这是最危险的一条。
5. **别把品牌与隐私那两条改回去**。系统提示词的身份句与 `session-log-deepseek` 的开关都
   在**插件层**（`dsh-plugins/dsh-ckjr-brand`），fork 里**刻意不改**上游那两处：
   `packages/core/system-prompt/src/index.ts:429` 那句 DeepSeek 文案保持原样，
   `packages/bundle/base/cordis.patch.yml:43` 那行也保持启用——这样上游更新提示词或
   遥测机制时我们不受影响。**若同步后有人在 fork 里"顺手"把这两处改成 CKJR/disabled，
   那就是改错地方了**：它会让每一次上游同步都产生冲突，而插件层本来已经解决。
   唯一需要在 fork 里重算的是生成物 `packages/bundle/ckjr/cordis.patch.yml`（见上一节）。
6. `packages/client/ui-settings-models/src/client/{ModelsSection,ProviderEditor}.tsx` ——
   见「设置 → 模型」一节。这两处是 fork 改过的上游文件；冲突时保住 `unknown` 规则
   （无 curated 字段就不给编辑器）与 `deepseek-account` 特例。
7. `apps/desktop-host/src/index.ts` 的端口行 —— **这条已经退场，别再改回来**。
   上游 `ecd9bf927` 把 `--port 19387` 改成 `--port 0`（由系统分配），理由正是固定端口
   在 Windows（Hyper-V/WinNAT 保留动态端口段）下会启动失败——而这恰好也解决了本 fork
   当初改端口要解决的「两个应用抢端口」。2026-10-08 同步时删掉了 fork 的
   `DEFAULT_WEB_PORT` 与 `$DSH_DESKTOP_WEB_PORT`，采纳上游写法，这个冲突点因此消失。
   随机端口不影响 CKJR 登录：`index.ts` 的 ready 消息本来就用 `ctx.webServer.port`
   上报实际端口，`desktopAccountBackend(origin)` 再由这个 origin 推导回调
   `redirect_uri`（`/ckjr/oauth/callback` 挂在同一个 web server 上）。
8. **上游抬版本会禁用全部出厂插件（2026-10-08 实测，最容易漏）** —— 合并把 harness 从
   `0.2.0-rc.2` 抬到 `0.2.1-alpha.1` 后，应用直接起不来：`CKJR is unavailable` /
   `desktop welcome: Web RPC failed`。上游的插件兼容性闸门
   （`packages/boot/app-boot/src/plugin-compatibility.ts`）按每个插件声明的 DSH peer 范围判定，
   而三个插件的 peer 当时是**精确版本** `0.2.0-rc.2`，于是三行全被禁用——
   `dsh: disabling profile plugin row "…"` **只写在 Host 的 stderr 里**，应用把它吞掉了；
   `account-controller` 因此一直 `pending (waiting for service: deepseekAccount)`，
   欢迎窗第一个 `account/getState` 就返回失败。
   - **根修在插件仓**：DSH peer 一律写**范围**。闸门用
     `semver.satisfies(…, { includePrerelease: true })`，所以 `^0.2.0-rc.2` 接受
     `0.2.1-alpha.1` 与未来的 `0.2.x` 预发布、拒绝 `0.3.0`；而精确的 `0.2.0-rc.2`
     连 `0.2.1-alpha.1` 都不接受。已在 `childelins/dsh-ckjr-plugins` 用 `f27c6b1` 修好，
     回归脚本 `verify-compatibility.mjs`（`79e2089`）跑的是**上游真正的闸门**——
     每次同步上游后跑一遍，别等安装包在商家机器上炸。
   - **本机临时放行**（只用于排查；商家新装的机器没有豁免，不能靠它发货）：
     `dsh plugin --profile desktop allow-version <包>@<版本> --dsh-version <当前版本> --accept-risk`，
     落在 `~/.ckjr/profiles/desktop/compatibility.json`。
   - **诊断入口**：手工拉起 Host 就能看到那些被吞掉的报错——
     `<unpacked>\ckjr-harness.exe --expose-internals <unpacked>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\index.js <runtimeDir> <profileDir> <primaryRuntime>`
     （不设 `DSH_CLIENT_VERSION` 会多一条 `desktop-product-telemetry` 的 `serviceVersion`
     报错，那是噪声，不是病因）。
   - 附带一条：`dsh plugin` 进程被杀会留下 **0 字节** 的 `package.json.lock`；陈旧锁接管依赖锁里
     记录的持有者 PID，空文件判定不了，后续每个写入命令都要白等 120 秒。删掉那个空文件即可。

## 已知待办

- [x] ~~**重新生成出厂补丁合并层**~~ 已核实完成（2026-10-08）：`packages/bundle/ckjr/cordis.patch.yml`
      里 `session-log-deepseek` 的 disable 行（`:98`）与 `ckjr-brand` 的 insert 行（`:111`、`:112`）
      都在，品牌句与 Session Log 两条改动**已生效**。需要重算时（改了插件 patch、或换了检出）：

      ```bash
      DSH_CKJR_PLUGINS_ROOT=<dsh-plugins 检出> pnpm --filter @deepseek-ai/dsh-desktop run generate:ckjr-bundle-patch
      ```

      跑完提交 `packages/bundle/ckjr/cordis.patch.yml`。打包流程会在 `pnpm pack` 之前自动重算，
      但那等于把 fork 的出厂内容交给构建时的插件检出去决定，检出不对就会静默少两条
      （见上一节的红色警告）。
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

## 交互界面一句里的产品名（`app:web-surface`）

**现象**：桌面端新会话里，代理会告诉用户「你是在 DeepSeek Harness Web GUI（`http://127.0.0.1:<端口>`）里跟我对话」。
端口由系统分配、每次启动不同（见「上游同步流程」第 7 条），所以这里不写死一个具体值。

**出处**：`packages/bundle/web-app/src/index.ts:150`

```ts
return `You are interacting with the user through the DeepSeek Harness Web GUI at ${webUrl}. `
```

注册处同文件 `:252-259`（section 名 `app:web-surface`、order = `WEB_SURFACE` = 10100，仅在 `config.surfaceContext` 时注册）。
桌面端本身就是 web-app bundle + 本地 web 服务，所以这句在桌面端会话里同样出现。

**落点：插件层** ✓（`@ckjr/dsh-ckjr-brand`，沿用它与身份句同一个 `system-prompt/assemble` waterfall）。
在 assembly 里找到 `app:web-surface`，把文本里的 `DeepSeek Harness` 换成 `CKJR Harness`：
**只改产品名** —— URL 是对的、后面讲 HMR/重建/web 资产那句属实现细节，都原样保留。

两个实现细节：
- `PromptAssembly` 的 JSDoc 说 sections "remain uninterpolated until rendered"，
  所以 `section.text` **可能是字符串、也可能仍是注册时那个函数**
  （上游注册的就是 `text: () => webSurfacePrompt(appRootUrl(promptCtx, publicUrl))`；
  上游加上 `--public-url` 之后，取 URL 的函数由 `localWebUrl` 变成了 `appRootUrl`）。两种都要处理，
  求值上游函数要包 try/catch —— 品牌没生效不该让整个会话起不来。
- `replaceAll` 对已替换过的文本是恒等操作，因此天然幂等（同一 assembly 会被反复组装）。

**为什么只能靠 waterfall、不能改那节本身**：与身份句同因 —— `app:web-surface` 由 `dsh-web-app`
在自己作用域里注册，本插件是全局插件，进不了那个作用域；能改到最终渲染内容的只有
`system-prompt/assemble`（其 JSDoc 写明 "The returned value is authoritative"）。

### `DSH_WEB_URL` 的环境变量描述：**插件层做不到**（已查实，未改 fork）

同一处 `packages/bundle/web-app/src/index.ts:265` 还有一条同样带品牌名的字符串
（2026-10-08 同步时上游把它由 `Canonical local URL of …` 改成了 `Advertised URL of …`，
随 `--public-url` 一起；品牌名照旧在）：

```ts
[DSH_WEB_URL]: { description: 'Advertised URL of the DeepSeek Harness Web GUI serving this session.' }
```

它经 `shellEnv.register()` 注册，**插件层无法改写**。证据（`packages/shell/shell-env/src/index.ts`）：

| 行 | 内容 | 含义 |
|---|---|---|
| `:114` | `register(contributor: BashEnvContributor): () => void` | 注册表**只有注册**这一个入口 |
| `:120` | `throw new Error(\`bash env contributor "${name}" is already registered\`)` | 同名**重注册直接抛错**，顶不掉 |
| `:41-43` | `interface BashEnvVariable { description: string }` | `description` **只在注册时**能写 |
| 导出面 | `name / inject / Config / BashEnvVariable / BashEnvContributor / BashEnvVariableInfo / ShellEnvRegistry / apply` | **没有任何修改 API，也没有 hook/waterfall** |

而且那条 `register()` 返回的 disposer 由 `dsh-web-app` 自己持有，插件拿不到。
**因此本项未处理**：改它必须动 fork，且只为一个字符串 —— 而它**是否真的进入模型可见的提示词尚未证实**
（实测中模型看到的是 `Managed $env:DSH_* variables expose current harness environment facts.` 这类概括句，
不是逐条描述）。等有证据表明它会露出来，再按最小改动处理。
