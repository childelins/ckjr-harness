/**
 * 只重建应用外壳、只重跑 electron-builder 的本地快路径（Windows x64，未签名）。
 *
 * 为什么需要它：完整打包（`package:desktop:win:x64:unsigned`）实测约 27 分钟，其中
 * prepare:dsh（~9 分钟）、build:official（~8 分钟）、release:pack（~4 分钟）、
 * prepare:runtime（~2 分钟）产出的都是"出厂内容"——dsh 包、出厂插件、Node/Python 运行时。
 * 改 `apps/desktop/src/**`、`apps/desktop/renderer/**` 或 `installer/assets/*.png` 时，
 * 这些内容一个字节都不会变，却要陪着等一遍。本脚本复用
 * `.desktop-build/targets/win-x64/` 下完整打包已经准备好的 `dsh/`、`runtime/`、`electron/`，
 * 只做四件事：重建外壳 → 重新光栅化安装器素材 → electron-builder → 打包后 smoke。
 *
 * 为什么参数与环境必须复用 package-target.ts：这条快路径唯一要保证的事，就是产出的
 * 应用和完整打包逐字节一致。electron-builder 的参数（desktopElectronBuilderArguments）、
 * 环境组装（withoutWindowsSigningEnvironment → withoutDesktopUploadCredentials →
 * macOSDownloadEnvironment → desktopElectronBuilderEnvironment）以及打包后 smoke 都在
 * package-target.ts 里，这里逐条调用它的导出，不自己拼一份。
 *
 * 快路径不写 `.desktop-build/packaging-runs/` 的发布证据：那个目录是完整打包留下的发布留档
 * （README 里明确说缺少 result.json 就等于完成状态未经确认），一次本地迭代不该混进去。
 *
 * 这条路径不覆盖的改动（仍然要跑完整打包）：`packages/**`、`apps/web/**`、`apps/desktop-host/**`、
 * `ckjr-plugins/**`、`native/**`、`vendor/**` 的内容会被 release:pack 打进 dsh 包与出厂插件，
 * 只有 release:pack + prepare:dsh 会重建它们；改这些目录时快路径产出的仍是上一次打包的旧内容。
 *
 * 实测（2026-10-01，热状态，dsh/runtime/electron 已就绪）：
 *   --dir  2 分 26 秒 = 外壳 3s + 素材 4s + electron-builder 1m20s + smoke 58s
 *   --full 8 分 01 秒 = 外壳 7s + 素材 6s + electron-builder 7m20s（NSIS 压缩）+ smoke 28s
 * 同一次完整打包 24 分 53 秒（prepare:dsh 9m18s + build:official 1m47s + release:pack 3m25s +
 * prepare:runtime 2m06s + electron-builder 7m32s + smoke 27s）。--dir 与 --full 的 win-unpacked
 * 只差一个文件：resources/elevate.exe（NSIS 目标才会复制进去，105 KB），其余逐字节一致。
 *
 * 产物（未签名，与完整打包同目录同文件名）：
 *   .desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked/ckjr-harness.exe
 *   .desktop-build/targets/win-x64/unsigned-artifacts/CKJR-Harness-<版本>-win-x64-unsigned.exe（--full）
 *
 * 用法：
 *   corepack pnpm --filter @deepseek-ai/dsh-desktop run package:app-only            # 只要解包目录，最快
 *   corepack pnpm --filter @deepseek-ai/dsh-desktop run package:app-only -- --full # 顺带打 NSIS 安装包
 *   ... -- --build-version 0.2.0-rc.2-test.20261001.1                              # 覆盖产物版本号
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { desktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { DESKTOP_BUILD_VERSION_ENV, validateDesktopBuildVersion } from './desktop-build-version.mjs'
import { desktopBuildCommitEnvironment, readDesktopBuildCommit } from './desktop-build-commit.mjs'
import { loadDesktopPackageEnvironment, validateDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { requireDesktopToolchain } from './desktop-toolchain-preflight.ts'
import { macOSDownloadEnvironment } from './macos-package-settings.mjs'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'
import {
  desktopElectronBuilderArguments,
  desktopElectronBuilderEnvironment,
  resolveDesktopPackageTarget,
  withoutDesktopUploadCredentials,
  withoutWindowsSigningEnvironment,
} from './package-target.ts'
import {
  clientBuildProcessEnvironment,
  repositoryClientBuildEnvironment,
  resolveClientBuildEnvironment,
} from '../../../scripts/client-build-environment.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')

/** 快路径只服务这一个目标：Windows x64 的未签名产物（signed 需要 SafeNet 硬件）。 */
const TARGET_NAME = 'win-x64'

/** 外壳包的过滤名；完整打包通过 build:official → build:lib:host 的最后一段构建它。 */
const DESKTOP_SHELL_FILTER = '@deepseek-ai/dsh-desktop'

/** 完整打包里 build:official 用的客户端构建档；外壳 bundle 内联的版本号来自它。 */
const OFFICIAL_CLIENT_PROFILE = 'official'

interface AppOnlyInvocation {
  /** 是否停在解包目录（--dir，默认），false 时继续打 NSIS 安装包。 */
  readonly directory: boolean
  /** 本次产物要标称的构建版本；未给出时用产品版本。 */
  readonly buildVersion: string | undefined
}

const PREPARED_STATE_REQUIREMENTS = [
  ['dsh/node_modules', 'prepare:dsh 安装出的 dsh 运行时依赖树'],
  ['dsh/package.json', 'prepare:dsh 写出的运行时清单（afterPack 会按它校验版本）'],
  ['dsh/desktop-runtime.json', 'prepare:dsh 写出的运行时描述文件（smoke 与 afterPack 都读它）'],
  ['runtime/bin', 'prepare:runtime 准备的原生运行时'],
  ['runtime/versions.json', 'prepare:runtime 记录的 Node 与 pnpm 版本（electron-builder 之外的资源也用它）'],
  ['runtime/primary-runtime', 'prepare:primary-runtime 准备的 Python 运行时'],
  ['electron/electron.exe', 'prepare:runtime 解出的 Electron 发行版（electron-builder 的 electronDist）'],
] as const

function formatDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m${(seconds % 60).toFixed(0)}s`
}

/** 打印一步的开始与用时；失败时也把用时留在终端上，便于对照完整打包的 27 分钟。 */
async function step<T>(label: string, action: () => Promise<T>): Promise<T> {
  process.stdout.write(`\n=== ${label} ===\n`)
  const started = performance.now()
  try {
    return await action()
  } finally {
    process.stdout.write(`--- ${label}：${formatDuration(performance.now() - started)} ---\n`)
  }
}

function packageVersion(path: string, label: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`desktop package (app only): ${label} has no version`)
  }
  return manifest.version
}

/**
 * 解析快路径自己的命令行。
 * @param argv - 脚本入口之后的参数。
 * @returns 是否只要解包目录，以及可选的构建版本。
 */
function parseInvocation(argv: readonly string[]): AppOnlyInvocation {
  const { values } = parseArgs({
    // pnpm 会把 `--` 分隔符一起转发过来，与 package-target.ts 的处理保持一致。
    args: argv.filter(argument => argument !== '--'),
    allowPositionals: false,
    options: {
      dir: { type: 'boolean', default: false },
      full: { type: 'boolean', default: false },
      'build-version': { type: 'string' },
    },
  })
  if (values.dir && values.full) throw new Error('desktop package (app only): --dir and --full cannot be combined')
  const requestedBuildVersion = values['build-version']?.trim()
  if (values['build-version'] !== undefined && (requestedBuildVersion === undefined || requestedBuildVersion === '')) {
    throw new Error('desktop package (app only): --build-version requires a value')
  }
  return { directory: !values.full, buildVersion: requestedBuildVersion }
}

/**
 * 确认完整打包已经把这份状态留在磁盘上。
 *
 * 快路径的全部价值来自"复用"，所以缺状态时必须立刻停下来说清楚要跑什么，
 * 而不是让 electron-builder 在几分钟后报一个看不懂的错（例如 dsh/ 空目录会产出
 * 一个没有 Host、装了也起不来的应用）。
 * @param paths - 目标构建路径。
 */
function requirePreparedState(paths: ReturnType<typeof desktopTargetBuildPaths>): void {
  const missing = PREPARED_STATE_REQUIREMENTS
    .map(([relative, reason]) => ({ relative, reason, path: join(paths.root, ...relative.split('/')) }))
    .filter(entry => !existsSync(entry.path))
  if (missing.length === 0) return
  throw new Error([
    `desktop package (app only): 缺少完整打包准备好的构建状态（${paths.root}）：`,
    ...missing.map(entry => `  - ${entry.relative}：${entry.reason}`),
    '这条快路径只复用完整打包的产物，自己不会重建 dsh 包、出厂插件或运行时。',
    '先跑一次完整打包把这些目录建起来：',
    '  corepack pnpm run package:desktop:win:x64:unsigned',
  ].join('\n'))
}

/**
 * 通过启动本脚本的包管理器运行一条 pnpm 命令，与 package-target.ts 的 runPnpm 同形。
 * @param args - pnpm 参数。
 * @param env - 子进程环境（由调用方按 package-target.ts 的方式组装好）。
 * @param cwd - 子进程工作目录。
 */
function runPnpm(args: readonly string[], env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  const pnpmEntry = process.env.npm_execpath
  if (pnpmEntry === undefined || pnpmEntry === '') {
    throw new Error('desktop package (app only): invoke this script through a pnpm package command')
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [pnpmEntry, ...args], { cwd, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop package (app only): pnpm ${args.join(' ')} exited with ${String(code ?? signal)}`))
    })
  })
}

/**
 * 重新光栅化 NSIS 素材（brand*.bmp / uninstaller-sidebar.bmp）并编译窗口边框 DLL。
 *
 * 参数与环境对齐 electron-builder-config.mjs 的 beforeBuild：同一个脚本、同一个
 * -OutputDirectory、同样先清掉签名变量。electron-builder 之后还会自己再跑一遍，
 * 重复调用是幂等的，显式跑一次是为了让"只改素材"的迭代在 electron-builder 之前
 * 就能看到素材生成失败（缺 VS C++ 生成工具时最典型）。
 * @param env - electron-builder 环境（已去掉签名配置）。
 * @param installerUiDirectory - 素材输出目录。
 */
function runInstallerAssets(env: NodeJS.ProcessEnv, installerUiDirectory: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      join(APP_ROOT, 'scripts', 'prepare-windows-installer.ps1'),
      '-OutputDirectory', installerUiDirectory], {
      cwd: APP_ROOT, env: scrubWindowsSigningEnvironment(env), stdio: 'inherit', windowsHide: true,
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop package (app only): prepare-windows-installer.ps1 exited with ${String(code ?? signal)}`))
    })
  })
}

function describeFile(path: string): string {
  if (!existsSync(path)) return '（缺失）'
  const size = statSync(path).size / (1024 * 1024)
  return `${path}（${size.toFixed(1)} MB）`
}

async function main(): Promise<void> {
  const startedAt = performance.now()
  const invocation = parseInvocation(process.argv.slice(2))
  const target = resolveDesktopPackageTarget(TARGET_NAME)
  const paths = desktopTargetBuildPaths(target.name)

  await step('1/6 检查完整打包留下的构建状态', async () => {
    requirePreparedState(paths)
    process.stdout.write(`desktop package (app only): 复用 ${paths.root}\n`)
  })

  const environment = loadDesktopPackageEnvironment(target.platform)
  // 未签名模式下这一步只校验无需凭据的本地配置（App ID、强更策略、npm 源），
  // 与完整打包同样在动构建之前失败。
  validateDesktopPackageEnvironment(environment, target, { unsigned: true })
  await step('2/6 检查打包工具链', () => requireDesktopToolchain(target.platform, environment))

  const productVersion = packageVersion(join(APP_ROOT, 'package.json'), 'desktop package')
  const buildVersion = invocation.buildVersion === undefined
    ? productVersion
    : validateDesktopBuildVersion(invocation.buildVersion, productVersion)
  environment[DESKTOP_BUILD_VERSION_ENV] = buildVersion
  Object.assign(environment, desktopBuildCommitEnvironment(readDesktopBuildCommit(REPOSITORY_ROOT)))
  process.stdout.write(`desktop package (app only): 产物版本 ${buildVersion}${buildVersion === productVersion ? '' : `（产品版本 ${productVersion}）`}\n`)

  // 以下四行逐条对应 package-target.ts 第 439-449 行的环境组装（该目标没有 macOS 设置，
  // 也没有签名变量需要回填），改动前请先回看那一段。
  const buildEnv = withoutWindowsSigningEnvironment(withoutDesktopUploadCredentials(environment))
  const targetEnv: NodeJS.ProcessEnv = {
    ...buildEnv,
    DSH_DESKTOP_TARGET_PLATFORM: target.platform,
    DSH_DESKTOP_TARGET_ARCH: target.arch,
  }
  const downloadEnv = macOSDownloadEnvironment(targetEnv, undefined)
  const electronBuilderEnv = desktopElectronBuilderEnvironment(downloadEnv, true)

  await step(`3/6 重建应用外壳（${DESKTOP_SHELL_FILTER} run build）`, async () => {
    // build:official 用 --profile official 决定外壳内联的客户端版本号；这里复用同一份
    // 解析逻辑（scripts/build.ts 的前几行），而不是让外壳退回仓库默认档。
    const clientEnvironment = resolveClientBuildEnvironment(
      repositoryClientBuildEnvironment(REPOSITORY_ROOT, buildEnv), OFFICIAL_CLIENT_PROFILE)
    await runPnpm(['--filter', DESKTOP_SHELL_FILTER, 'run', 'build'],
      clientBuildProcessEnvironment(buildEnv, clientEnvironment), REPOSITORY_ROOT)
  })

  await step('4/6 重新生成安装器素材', () => runInstallerAssets(electronBuilderEnv, join(paths.root, 'installer-ui')))

  await step(`5/6 electron-builder（${invocation.directory ? '--dir，只出解包目录' : 'NSIS 安装包'}）`,
    () => runPnpm(desktopElectronBuilderArguments(target, invocation.directory), electronBuilderEnv, APP_ROOT))

  await step('6/6 打包后 smoke（与完整打包同一条命令）',
    () => runPnpm(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts', '--unsigned'], targetEnv, APP_ROOT))

  const application = join(paths.unsignedArtifacts, 'win-unpacked')
  const executable = join(application, 'ckjr-harness.exe')
  const installer = join(paths.unsignedArtifacts, `CKJR-Harness-${buildVersion}-win-x64-unsigned.exe`)
  process.stdout.write([
    '',
    `desktop package (app only): 完成，总用时 ${formatDuration(performance.now() - startedAt)}（完整打包实测约 27 分钟）`,
    `  应用外壳：${describeFile(executable)}`,
    invocation.directory
      ? '  安装包  ：本次没打（--dir）；需要 NSIS 安装包时加 --full，它会多花几分钟做压缩。'
      : `  安装包  ：${describeFile(installer)}`,
    '  重复迭代：改完 apps/desktop/src、apps/desktop/renderer 或 installer/assets 后直接重跑本脚本。',
    '',
  ].join('\n'))
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  try {
    await main()
  } catch (error) {
    // 与 package-target.ts 一样：失败细节写 stderr，退出码交给 package.json 脚本的调用方。
    process.stderr.write(`\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
