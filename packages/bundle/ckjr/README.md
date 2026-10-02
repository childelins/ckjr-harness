---
description: "The 创客匠人 (CKJR) factory bundle for the branded Desktop app: CKJR account provider, CKJR LLM route, and the CKJR login panel in one profile layer."
kind: "package-bundle"
---

# @ckjr/dsh-bundle-ckjr

English | [中文](README.zh.md)

## Summary

This bundle is the single profile layer the branded Desktop app ships for 创客匠人 (CKJR). It disables the shipped `deepseek-account` and `ui-settings-account` rows and inserts the CKJR account provider, the `ckjr` LLM route, and the CKJR login panel, so a merchant who installs the installer signs in against the CKJR SaaS with no manual `dsh plugin add`. It carries no code of its own: the three `@ckjr/dsh-*` packages it depends on own every row it mounts, and `cordis.patch.yml` is the whole substance.

## Use this package

`packages/boot/app-boot` ships this bundle in `PROFILE_TEMPLATES.web.bundles`, last, so every Desktop profile initialized by the branded app selects it. A profile that already exists is never rewritten: a merchant upgrading from a build that did not bundle these plugins keeps the bundle selection it has.

This repository's Desktop packaging (`apps/desktop/scripts/package-target.ts`) packs the bundle and the three plugins it depends on into the local npm package set, which `apps/desktop/src/project-manager.ts` turns into `file:` dependencies of the shipped runtime project. The three plugin packages themselves live in the separate [`childelins/dsh-ckjr-plugins`](https://github.com/childelins/dsh-ckjr-plugins) repository, checked out at `ckjr-plugins/` for a build.

## Understand the implementation

The bundle is a static patch document. It mounts no service, emits no events, and owns no mutable state; each inserted row's package owns that row's behavior.

`cordis.patch.yml` restates, line for line, the three patches the plugin packages ship in their own repository, in the order `ckjr-account`, `ckjr-llm`, `ckjr-client-ui`. A profile applies one patch list per bundle, so the composition must be consolidated here: a dependency of a bundle contributes rows only through the bundle's own patch file.

The two `disabled: true` entries address rows by id and must apply after the layers that insert those rows, which is why this bundle is last in `dsh.profile.bundles`.

## Model Experience

Indirectly, through each inserted row's package, which owns that row's model-facing behavior.

#### KV Cache effect

The bundle itself adds no request prefix; each inserted row's package owns any cache effect.

## Known Limitations and Deferred Work

- **The two plugin patches are maintained twice** — `cordis.patch.yml` here and the three files in `childelins/dsh-ckjr-plugins` must stay equivalent; a change on either side that is not mirrored leaves the installed app mounting a different row set than the plugin repository describes.
- **An existing profile is not upgraded** — profile initialization is create-only, so a Desktop install whose `profiles/desktop` predates this bundle keeps its old bundle list until the profile is recreated.
- **The plugin checkout is a build input** — `ckjr-plugins/` must be present before `pnpm install`; the workspace entry for it is a required part of the fork, not an optional extra.
