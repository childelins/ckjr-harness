/**
 * 创客匠人 (CKJR) 桌面端的 Harness 主目录默认值。
 *
 * 官方 DeepSeek Harness 用 `~/.dsh`；本 fork 的 CKJR 构建用自己的 `~/.ckjr`。
 *
 * 为什么不与官方共用 `~/.dsh`：
 * - 共用会让两个应用读写同一个 profile 与会话，官方实例正在运行时，CKJR 实例会接到
 *   同一个 runtime 上——表现为「点开 CKJR 却进了官方应用」。
 * - 共用还会让已存在的 profile 挡住本 fork 的 bundle 名单：app-boot 的 `initProfile`
 *   只在 profile 不存在时创建，所以从官方版升级上来的机器会保留官方的 bundle 列表，
 *   CKJR 的插件层永远不生效。
 *
 * 为什么在模块加载时就把值写回 `process.env`，而不是只改桌面端自己的解析：
 * 桌面端解析出的路径会通过继承的环境变量传给它的 Host 子进程
 * （见 `login-shell-environment.ts` 的说明），所以在这里设定一次，
 * desktop 与它拉起的 runtime 就都落在同一个主目录上。本模块必须在 `main.ts` 的
 * import 列表里排第一位，确保早于任何解析路径的模块体执行。
 *
 * `$DSH_HOME` 显式设置时一律优先——开发与测试用隔离目录跑就靠它。
 * @module harness-home
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** 本 fork 的 Harness 主目录名，与官方的 `.dsh` 区分开。 */
export const CKJR_HARNESS_HOME_DIR_NAME = '.ckjr'

/** 环境变量名，与 `@deepseek-ai/dsh-home-paths` 的 `DSH_HOME` 一致。 */
export const DSH_HOME_ENV = 'DSH_HOME'

/**
 * 未显式设置 `$DSH_HOME` 时，把 Harness 主目录默认到 `~/.ckjr` 并写回环境变量。
 * @param env - 环境映射；默认写回 `process.env`，便于测试注入。
 * @returns 生效的 Harness 主目录。
 */
export function installCkjrHarnessHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[DSH_HOME_ENV]
  if (configured !== undefined && configured.trim().length > 0) return configured
  const home = join(homedir(), CKJR_HARNESS_HOME_DIR_NAME)
  env[DSH_HOME_ENV] = home
  return home
}

// 模块加载即生效：main.ts 把它放在 import 列表首位，因此这里早于任何
// 解析 Harness 路径的模块体运行。
installCkjrHarnessHome()
