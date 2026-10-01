/**
 * 生成出厂 bundle 的合并补丁层：packages/bundle/ckjr/cordis.patch.yml。
 *
 * 为什么要合并这一层：桌面端 profile 只按名字选择 bundle，而一个 bundle 只会加载它
 * 自己 `dsh.bundle.patch` 指到的文件——它 `dependencies` 里的包不会各自再贡献一层。
 * 因此 ckjr-plugins/ 里各插件的 cordis.patch.yml 必须合成一份，否则安装包只会装上
 * 插件、却不会把它们的行接进 profile（装上了却不起作用，最难查的一种失败）。
 *
 * 为什么是生成而不是手工维护：源在另一个仓库（childelins/dsh-plugins）。手工合并意味着
 * 每次改插件 patch 都要记得同步这里，忘了不会报错，只会静默产出行为不对的安装包。
 * 由本脚本扫目录生成后，**在 dsh-plugins 里新增插件不需要改 fork 的任何文件**。
 *
 * 用法：
 *   tsx scripts/generate-ckjr-bundle-patch.ts           写入
 *   tsx scripts/generate-ckjr-bundle-patch.ts --check    只校验是否与检出一致
 *
 * 打包流程（package-target.ts）在 pnpm pack 之前会调用本模块重新生成，
 * 所以本地与 CI 都不可能用上过期的合并补丁。
 * @module generate-ckjr-bundle-patch
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..', '..')
/**
 * childelins/dsh-plugins 的检出位置。
 *
 * 默认在仓库根的 `ckjr-plugins/` —— **CI 依赖这个默认值**（工作流把插件 clone 到
 * `ckjr-plugins/`，且不设任何环境变量）。本地把插件检出放在仓库外时用
 * `$DSH_CKJR_PLUGINS_ROOT` 指过去：插件仓库与 fork 各自独立迭代，
 * fork 里既不需要子目录、也不需要联接。
 */
const PLUGINS_ROOT = process.env.DSH_CKJR_PLUGINS_ROOT?.trim() || join(REPOSITORY_ROOT, 'ckjr-plugins')
const BUNDLE_DIRECTORY = join(REPOSITORY_ROOT, 'packages', 'bundle', 'ckjr')

/** 生成物路径。 */
export const CKJR_BUNDLE_PATCH = join(BUNDLE_DIRECTORY, 'cordis.patch.yml')

const MISSING_CHECKOUT_HINT =
  'git@github.com:childelins/dsh-plugins.git 检出到 ckjr-plugins/ 之后再构建'
  + '（CI 由工作流自动检出，本地见 CKJR-FORK.md）'

/** 一个参与合并的插件：目录名、包名，以及它自己那份补丁的原文。 */
interface CkjrPluginPatch {
  /** ckjr-plugins/ 下的目录名。 */
  readonly directory: string
  /** 包名，例如 `@ckjr/dsh-ckjr-account`。 */
  readonly name: string
  /** 该插件 cordis.patch.yml 的原文（已去掉首尾空行）。 */
  readonly content: string
}

/** 插件补丁的固定文件名。 */
const PLUGIN_PATCH_FILENAME = 'cordis.patch.yml'

/**
 * 读出 ckjr-plugins/ 下有 `cordis.patch.yml` 的插件，按目录名升序。没有该文件的目录会被
 * 跳过（例如纯文档目录）。
 *
 * 为什么按固定文件名找而不是读某个 manifest 字段：这一层只关心「哪些目录贡献了行」，
 * 固定文件名让新增插件不必再额外声明一次自己。上游也确实允许一个包既是 bundle
 * （声明 dsh.bundle.patch）又被补丁以包名当行引用——`packages/bundle/web-app` 就是如此，
 * 所以「声明 bundle 会让包不被加载」是错的，别照那个思路排查。
 *
 * 真正决定这些行能否被导入的是**解析作用域**：Loader 以 profile 目录为 base 解析行，
 * 只有落在 runtime resolution 的 `entries` 表里的包名才能被路由到真实目录。`entries` 由两条
 * 闭包拼成——installation scope（从 `apps/desktop-host/src/index.ts` 的 installAnchor 那个
 * manifest 出发的 dependencies 闭包）与 profile scope（不在 installation scope 里的 bundle
 * 层，对它自己的 dependencies 求闭包）。
 *
 * 本 fork 的出厂插件只靠**前者**：installAnchor 必须指向真正声明 @ckjr/\* 的那个包——也就是
 * 外层包装包 `@deepseek-ai/dsh-desktop-runtime`（它由 `prepare-dsh.ts` 生成，dependencies 里
 * 列了包集合中的每一个包），而不是内层的 `@deepseek-ai/dsh`（它的依赖里没有任何 @ckjr/\*）。
 * 指错时闭包为 0 命中，行会回落到「从 <DSH_HOME>/profiles/ 起算」的原生解析，
 * 而插件装在 <runtimeDir>/node_modules 下——于是 `ERR_MODULE_NOT_FOUND`，
 * 且异常会被 Loader 的 catch 吞掉，最终在 app-boot 汇总成一句误导性的 `failed to import`。
 *
 * 另一条 profile scope 的路要 bundle 自己声明 dependencies，本 fork **刻意不走**：插件不在
 * pnpm 工作区里（见根 pnpm-workspace.yaml 的说明）、@ckjr/\* 是未发布的 private 包，
 * 一旦声明就必然重解析 `pnpm-lock.yaml` 里 `packages/bundle/ckjr` 的空 importer，
 * 让 `--frozen-lockfile` 失败。改 anchor 已足够，不必两处都动。
 * @returns 参与合并的插件补丁，顺序稳定。
 */
function readPluginPatches(): CkjrPluginPatch[] {
  if (!existsSync(PLUGINS_ROOT)) {
    throw new Error(`CKJR bundle patch: 缺少插件检出 ${PLUGINS_ROOT}；${MISSING_CHECKOUT_HINT}`)
  }
  const patches: CkjrPluginPatch[] = []
  const entries = readdirSync(PLUGINS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const manifestPath = join(PLUGINS_ROOT, entry.name, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown }
    const name = manifest.name
    if (typeof name !== 'string' || name === '') throw new Error(`${manifestPath}: 缺少包名`)
    const patchPath = join(PLUGINS_ROOT, entry.name, PLUGIN_PATCH_FILENAME)
    if (!existsSync(patchPath)) continue
    patches.push({ directory: entry.name, name, content: readFileSync(patchPath, 'utf8').trim() })
  }
  if (patches.length === 0) {
    throw new Error(`CKJR bundle patch: ${PLUGINS_ROOT} 下没有任何含 ${PLUGIN_PATCH_FILENAME} 的插件`)
  }
  return patches
}

/**
 * 按当前检出渲染合并补丁的完整文本。
 * @returns 生成物应有的内容，以换行结尾。
 */
export function renderCkjrBundlePatch(): string {
  const patches = readPluginPatches()
  const order = patches
    .map(patch => `#   ${patch.name.padEnd(30)} ← ckjr-plugins/${patch.directory}`)
    .join('\n')
  const sections = patches
    .map(patch => `# ===== ${patch.name}  (ckjr-plugins/${patch.directory}) =====\n${patch.content}`)
    .join('\n\n')
  return `# ⚠️ 生成物，请勿手工编辑：本文件由 apps/desktop/scripts/generate-ckjr-bundle-patch.ts
# 扫描 ckjr-plugins/ 里各插件的 cordis.patch.yml 合并而成。手工改动会被下一次
# 打包或 --check 覆盖/判定为不一致；要改行为，请改对应插件自己的 cordis.patch.yml。
#
# 为什么要合成这一层：桌面端 profile 只按名字选择 bundle，而一个 bundle 只会加载
# 它自己 dsh.bundle.patch 指到的文件——它 dependencies 里的包不会各自再贡献一层。
# 不合并的话，安装包只会装上插件、却不会把它们的行接进 profile。
#
# 合并顺序（目录名升序）：
${order}
#
# 本 bundle 必须排在 PROFILE_TEMPLATES.web.bundles 的最后：下面各插件的 disable
# 定位的是 dsh-base / dsh-web-app 已经 insert 进来的出厂行，patch 按 id 查找，
# 被定位的行必须已经存在。
#
# CKJR 各插件之间没有顺序依赖：disable 的目标都来自前两层，insert 的 id 互不相同。
# 若将来某个插件的 patch 需要引用另一个插件 insert 的行，就必须在这里引入显式顺序，
# 而不能继续只靠目录名排序。
#
# 重新生成：pnpm --filter @deepseek-ai/dsh-desktop run generate:ckjr-bundle-patch
# 校验一致：pnpm --filter @deepseek-ai/dsh-desktop run generate:ckjr-bundle-patch -- --check

${sections}
`
}

/**
 * 把当前检出渲染成合并补丁并写入磁盘。
 * @returns 内容是否发生了变化（false 表示本来就已经一致）。
 */
export function generateCkjrBundlePatch(): boolean {
  const rendered = renderCkjrBundlePatch()
  const existing = existsSync(CKJR_BUNDLE_PATCH) ? readFileSync(CKJR_BUNDLE_PATCH, 'utf8') : undefined
  if (existing === rendered) return false
  writeFileSync(CKJR_BUNDLE_PATCH, rendered, 'utf8')
  return true
}

function main(): void {
  const check = process.argv.includes('--check')
  const existing = existsSync(CKJR_BUNDLE_PATCH) ? readFileSync(CKJR_BUNDLE_PATCH, 'utf8') : undefined
  const rendered = renderCkjrBundlePatch()
  if (existing === rendered) {
    console.log('CKJR bundle patch 与 ckjr-plugins 检出一致。')
    return
  }
  if (check) {
    console.error('✗ packages/bundle/ckjr/cordis.patch.yml 与 ckjr-plugins 检出不一致。')
    console.error('  它是生成物：运行 pnpm --filter @deepseek-ai/dsh-desktop run generate:ckjr-bundle-patch')
    console.error('  重新生成并提交，不要手工编辑。')
    process.exitCode = 1
    return
  }
  writeFileSync(CKJR_BUNDLE_PATCH, rendered, 'utf8')
  console.log(`已生成 ${CKJR_BUNDLE_PATCH}`)
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
