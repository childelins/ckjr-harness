# 本地打出 CKJR Windows 安装包

CI 只在推 `ckjr-harness-v*` 标签时打包；日常改代码、想马上拿到安装包时走这里。

## 一条命令

```powershell
cd D:\Code\ckjr-harness
pwsh -NoProfile -File scripts/package-ckjr-windows.ps1
```

脚本自己会做前置检查（VS C++ 工具、插件检出、`.env.windows`）、设置网络环境变量、
跑完整流水线，最后打印产物路径与 SHA256。首次约 30-50 分钟，缓存热了以后 20-25 分钟。

可选参数：

| 参数 | 用途 |
|---|---|
| `-BuildVersion 0.2.0-rc.3` | 覆盖版本号（默认取 `apps/desktop/package.json`） |
| `-NoProxy` | 不走系统代理（见下方"网络"） |
| `-ProxyUrl http://127.0.0.1:7890` | 换代理地址 |
| `-SkipInstall` | 跳过 `pnpm install`（依赖没变时省 1 分钟） |

## 一次性准备

**1. Visual Studio C++ 生成工具**（打 NSIS 前要编译窗口边框 DLL）

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools `
  --accept-package-agreements --accept-source-agreements `
  --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --installPath D:\VSBuildTools"
```

约 3-6 GB，**需要管理员**。装到 D 盘是因为 C 盘空间紧张，装哪都行。
自检（与打包脚本用的是同一条命令）：

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" `
  -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
```

**2. 插件检出**（出厂插件在另一个仓库）

```bash
git clone git@github.com:childelins/dsh-ckjr-plugins.git ckjr-plugins
```

`ckjr-plugins/` 已在 `.gitignore` 里。**新增插件不需要改本仓库任何文件**——
打包会扫目录、自动合并补丁、自动纳入出厂包集合（见 `CKJR-FORK.md`）。

检出**已经在别处**时不必再克隆一份，做个目录联接即可（打包脚本只要求
`<仓库>/ckjr-plugins/*/package.json` 存在，联接对它是透明的）：

```powershell
New-Item -ItemType Junction -Path D:\Code\ckjr-harness\ckjr-plugins -Target D:\Code\dsh-ckjr-plugins
```

**3. `apps/desktop/.env.windows`**（已被 git 忽略）

未签名 + test 部署的最小内容：

```
DSH_DESKTOP_APP_ID=com.ckjr.harness.desktop
DSH_DESKTOP_AUTO_UPDATE_ENV=test
DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN=https://kpapi-cs.ckjr001.com
DSH_DESKTOP_MANDATORY_UPDATE_CONFIG='{"allowedAuthOrigins":["https://kpapi-cs.ckjr001.com"]}'
DSH_DESKTOP_NPM_REGISTRY=https://registry.npmmirror.com
```

强更策略源是**必需项**，未签名构建也要求（`desktop-policy-environment.mjs`）。

**4. 依赖**

```powershell
corepack pnpm install --frozen-lockfile
```

必须能冻结通过：走到 `--no-frozen-lockfile` 会全量重解析，可能浮动传递依赖。
锁文件的现状见 `CKJR-FORK.md`。

## 产物

```
apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\
  CKJR-Harness-<版本>-win-x64-unsigned.exe
  CKJR-Harness-<版本>-win-x64-unsigned.exe.blockmap
```

未签名，首次运行会被 SmartScreen 拦（"更多信息 → 仍要运行"）。正式签名需要
SafeNet USB Token + EV 证书，托管 runner 与本地都没有该硬件。

应用数据默认落在 `%USERPROFILE%\.ckjr`，与官方 DeepSeek Harness 的 `.dsh` 分开
（见 `CKJR-FORK.md` 的说明）。

## 网络

国内直连 `registry.npmmirror.com` 实测只有 **~54 KB/s**，走系统代理约 **875 KiB/s**——
所以脚本默认启用 `http://127.0.0.1:17890`。node/pnpm 会读 `HTTPS_PROXY`/`HTTP_PROXY`，
node 的原生 `fetch` 不读，所以别的工具（如自写脚本）需要显式配代理。

`prepare:primary-runtime` 会下 Node（nodejs.org）、Python（GitHub Releases）和 4 个
wheel（PyPI）。这几步国内直连很慢或不通。缓存在
`apps/desktop/.desktop-build/downloads/`，**文件名就是该文件的 SHA256**，
所以可以从任意镜像预置，`prepare.ts` 会自己校验：

| 文件 | 可用镜像 |
|---|---|
| `node-v<版本>-win-x64.zip` | `https://registry.npmmirror.com/-/binary/node/v<版本>/` |
| `cpython-...-install_only_stripped.tar.gz` | GitHub 直连（实测可通） |
| 4 个 wheel | `https://pypi.tuna.tsinghua.edu.cn/packages/...` |

文件名、目标架构与校验和都在 `scripts/primary-runtime/lock.json`。

## 排错

| 现象 | 原因与处理 |
|---|---|
| `vswhere: spawn ... ENOENT` | 缺 VS C++ 生成工具，见上方一次性准备 |
| `parse.ts TS2769` / `micromark-util-types@2.0.2` 与 `2.0.3` 冲突 | 陈旧增量状态，常出现在依赖刚变过之后：删掉所有 `*.tsbuildinfo` 再跑 |
| 长时间卡在 `download:electron` / `prepare:primary-runtime` | 网络，见上方"网络" |
| 卡在 `prepare:dsh` 且日志刷 4-48 KiB/s | 同上，确认代理生效 |
| `ERR_PNPM_OUTDATED_LOCKFILE` | 锁文件与工作区不一致；跑一次不带 `--frozen-lockfile` 的安装并提交锁文件 |
| 推送时报 `pnpm: command not found` | lefthook 的钩子在 Git Bash 里找不到 pnpm；`corepack enable`（需管理员）或推送时设 `LEFTHOOK=0` |
| 安装包跑起来进了官方 DeepSeek Harness | 不该再发生；若出现，检查 `$DSH_HOME` 是否被外部设成了 `~/.dsh` |

## 与 CI 的差别

| | 本地 | CI（`ckjr-harness-v*` 标签） |
|---|---|---|
| 触发 | `scripts/package-ckjr-windows.ps1` | 推 `ckjr-harness-v<版本>` 标签 |
| 签名 | 未签名 | 未签名 |
| macOS | 不支持（缺 Apple 签名/公证凭据） | 需设 `CKJR_BUILD_MACOS=true` 且备齐凭据 |
| 更新源 | test 部署 | test 部署（production 需 `DOWNLOAD_PROD_ORIGIN`） |
| 产物落点 | `.desktop-build/targets/win-x64/unsigned-artifacts/` | 运行页面的 Artifacts，并挂到 GitHub Release |
