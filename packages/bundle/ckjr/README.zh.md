---
description: "创客匠人 (CKJR) 品牌桌面端的出厂 bundle：账号 Provider、LLM 路由与登录界面合成一个 profile 层。"
kind: "package-bundle"
---

# @ckjr/dsh-bundle-ckjr

[English](README.md) | 中文

## Summary

本 bundle 是品牌化桌面端为创客匠人 (CKJR) 出厂的唯一 profile 层：它 disable 出厂的 `deepseek-account` 与 `ui-settings-account` 两行，再 insert CKJR 账号 Provider、`ckjr` LLM 路由与 CKJR 登录面板，使商家装完安装包即可直接登录 CKJR SaaS，无需手工 `dsh plugin add`。它自身不含任何代码：它挂载的每一行都由它依赖的三个 `@ckjr/dsh-*` 包负责，`cordis.patch.yml` 就是它的全部内容。

## 使用方式

`packages/boot/app-boot` 把本 bundle 放在 `PROFILE_TEMPLATES.web.bundles` 的最后一项，因此品牌化应用初始化的每个 Desktop profile 都会选中它。已存在的 profile 不会被改写：从「未预装插件」的版本升级上来的商家，保留它原有的 bundle 选择。

本仓库的桌面端打包（`apps/desktop/scripts/package-target.ts`）把本 bundle 与它依赖的三个插件一起打进本地 npm 包集合，再由 `apps/desktop/src/project-manager.ts` 变成出厂运行时工程的 `file:` 依赖。三个插件包本身位于另一个仓库 [`childelins/dsh-ckjr-plugins`](https://github.com/childelins/dsh-ckjr-plugins)，构建时检出到 `ckjr-plugins/`。

## 实现说明

本 bundle 是一份静态 patch 文档：不挂载服务、不发事件、不持有可变状态，被 insert 的每一行的行为归它自己的包所有。

`cordis.patch.yml` 与插件包仓库里三份 patch 逐行等价，顺序为 `ckjr-account`、`ckjr-llm`、`ckjr-client-ui`。一个 profile 对每个 bundle 只加载它自己 `dsh.bundle.patch` 指到的文件，所以合成必须在这里完成：bundle 的依赖只能通过 bundle 自己的 patch 文件贡献行。

两条 `disabled: true` 按 id 定位行，必须排在 insert 这些行的层之后——这正是本 bundle 位于 `dsh.profile.bundles` 末尾的原因。

## Model Experience

间接生效：每一行的模型侧行为由被 insert 的那个包自己负责。

#### KV Cache effect

本 bundle 自身不引入任何请求前缀；缓存效果归被 insert 的每个包所有。

## 已知限制与待办

- **三份插件 patch 被维护了两遍** —— 本文件与 `childelins/dsh-ckjr-plugins` 里的三份必须保持一致；任一侧改了不同步，装出来的应用就会挂载与插件仓库描述不同的一套行。
- **已存在的 profile 不会升级** —— profile 初始化是「只在不存在时创建」，因此 `profiles/desktop` 早于本 bundle 的 Desktop 安装会一直保留旧 bundle 列表，直到 profile 被重建。
- **插件检出是构建输入** —— `pnpm install` 之前必须存在 `ckjr-plugins/`；工作区里那一条不是可选项，而是本 fork 的必需部分。
