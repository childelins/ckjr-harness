import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDesktopHostPackageFiles,
  selectDesktopPackageClosure,
  type PackedDesktopPackage,
} from '../scripts/prepare-package-set.ts'

function packed(name: string, manifest: Record<string, unknown> = {}): PackedDesktopPackage {
  return { tarball: `${name}.tgz`, manifest: { name, version: '1.0.0', ...manifest } }
}

/**
 * 出厂预装的创客匠人 (CKJR) 插件闭包：bundle 本身加上它依赖的三个插件包。
 * bundle 是闭包根之一，缺了它闭包直接报错，所以每个用例都要把它放进 packed 输入。
 */
function ckjrPackedPackages(): [string, PackedDesktopPackage][] {
  return [
    ['@ckjr/dsh-bundle-ckjr', packed('@ckjr/dsh-bundle-ckjr', {
      dependencies: {
        '@ckjr/dsh-account': '0.1.0',
        '@ckjr/dsh-client-ui-ckjr': '0.1.0',
        '@ckjr/dsh-llm': '0.1.0',
      },
    })],
    ['@ckjr/dsh-account', packed('@ckjr/dsh-account')],
    ['@ckjr/dsh-client-ui-ckjr', packed('@ckjr/dsh-client-ui-ckjr')],
    ['@ckjr/dsh-llm', packed('@ckjr/dsh-llm')],
  ]
}

describe('desktop package-set selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not select a packaging target when imported as a library', async () => {
    vi.stubEnv('DSH_DESKTOP_TARGET_PLATFORM', 'linux')
    vi.stubEnv('DSH_DESKTOP_TARGET_ARCH', 'x64')
    vi.resetModules()
    await expect(import('../scripts/prepare-package-set.ts')).resolves.toHaveProperty('prepareDesktopPackageSet')
  })

  it('includes only the available internal production closure', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ...ckjrPackedPackages(),
      ['@deepseek-ai/dsh', packed('@deepseek-ai/dsh', {
        dependencies: { '@deepseek-ai/dsh-base': '^1.0.0', external: '^2.0.0' },
        optionalDependencies: { '@deepseek-ai/platform-package': '1.0.0', '@deepseek-ai/missing-platform': '1.0.0' },
      })],
      ['@deepseek-ai/dsh-desktop-host', packed('@deepseek-ai/dsh-desktop-host', {
        dependencies: { '@deepseek-ai/dsh': '^1.0.0' },
      })],
      ['@deepseek-ai/dsh-base', packed('@deepseek-ai/dsh-base', {
        peerDependencies: { '@deepseek-ai/cordis': '^1.0.0' },
      })],
      ['@deepseek-ai/cordis', packed('@deepseek-ai/cordis')],
      ['@deepseek-ai/platform-package', packed('@deepseek-ai/platform-package')],
      ['@deepseek-ai/unused', packed('@deepseek-ai/unused')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@ckjr/dsh-account',
      '@ckjr/dsh-bundle-ckjr',
      '@ckjr/dsh-client-ui-ckjr',
      '@ckjr/dsh-llm',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh',
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-desktop-host',
      '@deepseek-ai/platform-package',
    ])
  })

  it.each([
    '@deepseek-ai/dsh-base', '@deepseek-ai/cordis', '@deepseek-ai/node-addon-system',
  ])('rejects required prepared package %s absent from the packed release inputs', (dependency) => {
    const available = new Map<string, PackedDesktopPackage>([
      ...ckjrPackedPackages(),
      ['@deepseek-ai/dsh', packed('@deepseek-ai/dsh', {
        dependencies: { [dependency]: '^1.0.0' },
      })],
      ['@deepseek-ai/dsh-desktop-host', packed('@deepseek-ai/dsh-desktop-host', {
        dependencies: { '@deepseek-ai/dsh': '^1.0.0' },
      })],
    ])
    expect(() => selectDesktopPackageClosure(available)).toThrow(/unpacked package/u)
    expect(() => selectDesktopPackageClosure(new Map([
      ['@deepseek-ai/dsh', packed('@deepseek-ai/dsh')],
    ]))).toThrow(/omit @deepseek-ai\/dsh-desktop-host/u)
  })

  it('requires every bundled CKJR plugin package in the packed release inputs', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ...ckjrPackedPackages().filter(([name]) => name !== '@ckjr/dsh-llm'),
      ['@deepseek-ai/dsh', packed('@deepseek-ai/dsh')],
      ['@deepseek-ai/dsh-desktop-host', packed('@deepseek-ai/dsh-desktop-host')],
    ])
    // 检出 ckjr-plugins/ 时它是工作区成员（报 unpacked package），没检出时报缺包，
    // 两种都必须在错误里点出是哪个插件，所以这里只断言包名。
    expect(() => selectDesktopPackageClosure(available)).toThrow(/@ckjr\/dsh-llm/u)
  })

  it('leaves independently published Office packages to npm resolution', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ...ckjrPackedPackages(),
      ['@deepseek-ai/dsh', packed('@deepseek-ai/dsh', {
        dependencies: {
          '@deepseek-ai/libreoffice-kit': '0.0.1',
          '@deepseek-ai/libreoffice-kit-wasm': '0.0.1',
        },
      })],
      ['@deepseek-ai/dsh-desktop-host', packed('@deepseek-ai/dsh-desktop-host')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@ckjr/dsh-account',
      '@ckjr/dsh-bundle-ckjr',
      '@ckjr/dsh-client-ui-ckjr',
      '@ckjr/dsh-llm',
      '@deepseek-ai/dsh',
      '@deepseek-ai/dsh-desktop-host',
    ])
  })

  it('requires both Desktop Host and public CLI entries', () => {
    const files = [
      'package/lib/index.js',
      'package/lib/cli.js',
    ]
    expect(() => {
      assertDesktopHostPackageFiles(files)
    }).not.toThrow()
    expect(() => {
      assertDesktopHostPackageFiles(files.slice(1))
    }).toThrow(/lib\/index\.js/u)
    expect(() => { assertDesktopHostPackageFiles(files.slice(0, 1)) }).toThrow(/lib\/cli\.js/u)
  })
})
