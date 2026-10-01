# 本地打出创客匠人 (CKJR) Windows 未签名安装包。
#
# 用法（在仓库根目录，管理员不是必需的，但要有 VS C++ 生成工具）：
#   pwsh -NoProfile -File scripts/package-ckjr-windows.ps1
#
# 可选参数：
#   -BuildVersion 0.2.0-rc.3   覆盖版本号（默认取 apps/desktop/package.json 的产品版本）
#   -NoProxy                   不走系统代理（默认走 http://127.0.0.1:17890，国内直连
#                              npmmirror 实测只有 ~54 KB/s，走代理约 875 KiB/s）
#   -ProxyUrl http://...       指定代理地址
#   -SkipInstall               跳过 pnpm install
#
# 产物：apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/CKJR-Harness-<版本>-win-x64-unsigned.exe
[CmdletBinding()]
param(
  [string]$BuildVersion = '',
  [switch]$NoProxy,
  [string]$ProxyUrl = 'http://127.0.0.1:17890',
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Step([string]$text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Fail([string]$text) { Write-Host "`n[失败] $text" -ForegroundColor Red; exit 1 }

Step '1/5 前置检查'

# Visual Studio C++ 生成工具：electron-builder 打 NSIS 前会编译窗口边框 DLL。
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
  Fail @"
缺少 Visual Studio 安装器（vswhere）。装 C++ 生成工具即可（约 3-6 GB，需管理员）：
  winget install --id Microsoft.VisualStudio.2022.BuildTools ``
    --accept-package-agreements --accept-source-agreements ``
    --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --installPath D:\VSBuildTools"
"@
}
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { Fail 'Visual Studio 存在但没有 C++ 生成工具（Microsoft.VisualStudio.Component.VC.Tools.x86.x64）。' }
Write-Host "  VS C++ 工具: $vs"

# 插件检出：package-target.ts 缺它就直接失败，不产出没有插件的安装包。
if (-not (Test-Path (Join-Path $repo 'ckjr-plugins/dsh-account/package.json'))) {
  Fail @"
缺少插件检出 ckjr-plugins/。先检出：
  git clone git@github.com:childelins/dsh-plugins.git ckjr-plugins
"@
}
$plugins = Get-ChildItem (Join-Path $repo 'ckjr-plugins') -Directory |
  Where-Object { Test-Path (Join-Path $_.FullName 'package.json') }
Write-Host "  插件检出: $($plugins.Count) 个包（$(($plugins.Name) -join ', ')）"

# 打包环境文件：未签名 + test 部署只需要强更策略源。
$envFile = Join-Path $repo 'apps/desktop/.env.windows'
if (-not (Test-Path $envFile)) {
  Fail @"
缺少 apps/desktop/.env.windows。最小内容（未签名 + test）：
  DSH_DESKTOP_APP_ID=com.ckjr.harness.desktop
  DSH_DESKTOP_AUTO_UPDATE_ENV=test
  DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN=https://kpapi-cs.ckjr001.com
  DSH_DESKTOP_MANDATORY_UPDATE_CONFIG='{"allowedAuthOrigins":["https://kpapi-cs.ckjr001.com"]}'
  DSH_DESKTOP_NPM_REGISTRY=https://registry.npmmirror.com
"@
}
Write-Host '  打包配置: apps/desktop/.env.windows'

Step '2/5 环境变量'
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
$env:npm_config_registry = 'https://registry.npmmirror.com'
# lefthook 的 pre-push/pre-commit 钩子会在构建过程中调用 pnpm，而 Git Bash 的 PATH 里
# 没有 pnpm（除非以管理员跑过 corepack enable），所以这里直接停用钩子。
$env:LEFTHOOK = '0'
$env:npm_config_fetch_retries = '10'
$env:npm_config_fetch_timeout = '1800000'
if (-not $NoProxy) {
  $env:HTTPS_PROXY = $ProxyUrl
  $env:HTTP_PROXY = $ProxyUrl
  $env:https_proxy = $ProxyUrl
  $env:http_proxy = $ProxyUrl
  $env:NO_PROXY = 'localhost,127.0.0.1'
  Write-Host "  代理: $ProxyUrl（-NoProxy 可关闭）"
} else {
  Write-Host '  代理: 未启用'
}
Write-Host '  注册源: https://registry.npmmirror.com'

if (-not $SkipInstall) {
  Step '3/5 安装依赖（--frozen-lockfile）'
  & corepack pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { Fail 'pnpm install 失败。' }
} else {
  Step '3/5 安装依赖（已跳过）'
}

Step '4/5 打包（build:official → pack → prepare → electron-builder → smoke）'
Write-Host '  这一步通常 20-40 分钟，首次下载 Electron 与运行时归档会更久。'
$pnpmArgs = @('run', 'package:desktop:win:x64:unsigned')
if ($BuildVersion) { $pnpmArgs += @('--', '--build-version', $BuildVersion) }
& corepack pnpm @pnpmArgs
if ($LASTEXITCODE -ne 0) {
  Write-Host @"

[失败] 打包未成功。常见原因：
  * TS2769 / micromark-util-types 类型冲突
      → 陈旧增量状态：删除所有 *.tsbuildinfo 后重试
        Get-ChildItem -Recurse -Filter *.tsbuildinfo | Remove-Item -Force
  * 卡在 download:electron 或 prepare:primary-runtime 很久
      → nodejs.org / PyPI 直连太慢：确认代理已生效，或预置下载缓存
        （缓存文件名 = 该文件的 SHA256，见 scripts/primary-runtime/lock.json）
  * ERR_PNPM_OUTDATED_LOCKFILE
      → pnpm-lock.yaml 与工作区不一致；跑 pnpm install（不带 --frozen-lockfile）后提交锁文件
"@ -ForegroundColor Yellow
  exit 1
}

Step '5/5 产物'
$dir = Join-Path $repo 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts'
$exe = Get-ChildItem $dir -Filter 'CKJR-Harness-*-unsigned.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { Fail "在 $dir 下没有找到安装包。" }
$hash = (Get-FileHash $exe.FullName -Algorithm SHA256).Hash
Write-Host ''
Write-Host "  安装包 : $($exe.FullName)" -ForegroundColor Green
Write-Host ("  大小   : {0:N1} MB" -f ($exe.Length / 1MB))
Write-Host "  SHA256 : $hash"
Write-Host ''
Write-Host '  未签名，首次运行会被 SmartScreen 拦（“更多信息 → 仍要运行”）。'
Write-Host '  应用数据默认落在 %USERPROFILE%\.ckjr（与官方 DeepSeek Harness 的 .dsh 分开）。'
