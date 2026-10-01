/**
 * 创客匠人 (CKJR) 桌面端在本 fork 里的身份：Electron 应用身份 + Harness 主目录。
 *
 * ## 为什么必须改 app.name 与 userData
 *
 * 打包后的 `package.json` 里 `name` 仍是上游的 `@deepseek-ai/dsh-desktop`，Electron 用它
 * 派生 `userData`（`%APPDATA%\<name>`）。官方 DeepSeek Harness 由同一份源码构建、`name`
 * 相同，因此两个应用**共用同一个 userData**；而 Electron 的单实例锁就建在 userData 上
 * （`main.ts` 末尾的 `claimDesktopSingleInstance`）。
 *
 * 后果：官方实例在运行时，CKJR 启动会认为「已有实例」，走 `app.quit()`——
 * 退出码 0、没有窗口、焦点留在官方应用，看起来就是「点开 CKJR 却进了官方应用」，
 * 而且 `~/.ckjr` 与自己的 userData 都不会被创建。
 *
 * ## 为什么 Harness 主目录也要分开
 *
 * 官方用 `~/.dsh`，本 fork 用 `~/.ckjr`。共用会让两个应用读写同一个 profile 与会话；
 * 而且已存在的 profile 会挡住本 fork 的 bundle 名单（app-boot 的 `initProfile` 只在
 * profile 不存在时创建），CKJR 的插件层就永远不生效。
 *
 * ## 调用时机
 *
 * 两件事都必须在**任何** `app.getPath('userData')` / `app.getPath('appData')` 之前完成。
 * `main.ts` 把本模块放在 import 列表首位，而 `main.ts` 自己的模块体（含
 * `app.setAppLogsPath()`，它会解析 userData）在所有 import 求值之后才执行，因此这里
 * 在模块加载时直接生效是安全的。
 *
 * `$DSH_HOME` 显式设置时一律优先——开发与测试用隔离目录跑就靠它。
 * @module fork-identity
 */

import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Electron 应用名，同时决定 `%APPDATA%\<name>` 这个 userData 目录。 */
export const CKJR_APP_NAME = 'ckjr-harness'

/** 本 fork 的 Harness 主目录名，与官方的 `.dsh` 区分开。 */
export const CKJR_HARNESS_HOME_DIR_NAME = '.ckjr'

/** 环境变量名，与 `@deepseek-ai/dsh-home-paths` 的 `DSH_HOME` 一致。 */
export const DSH_HOME_ENV = 'DSH_HOME'

/**
 * 把 Electron 的应用身份固定到 CKJR：应用名改成 `ckjr-harness`，userData 指到
 * `%APPDATA%\ckjr-harness`。两者都设，是因为单实例锁的实现细节不应被依赖——
 * 无论它取名字还是取路径，断开其一即可不再与官方应用相撞。
 */
export function installCkjrAppIdentity(): void {
  app.setName(CKJR_APP_NAME)
  app.setPath('userData', join(app.getPath('appData'), CKJR_APP_NAME))
}

/**
 * 未显式设置 `$DSH_HOME` 时，把 Harness 主目录默认到 `~/.ckjr` 并写回环境变量。
 *
 * 写回环境变量而不是只改桌面端自己的解析：桌面端解析出的路径会通过继承的环境变量
 * 传给它的 Host 子进程（见 `login-shell-environment.ts` 的说明），因此设定一次，
 * desktop 与它拉起的 runtime 就都落在同一个主目录上。
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

// 模块加载即生效：main.ts 把它放在 import 列表首位，因此这里早于任何解析
// userData 或 Harness 路径的模块体运行。
installCkjrAppIdentity()
installCkjrHarnessHome()
