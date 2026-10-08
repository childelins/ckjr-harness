import { expect, it } from 'vitest'
import { resolveDesktopCkjrEnvironment } from '../scripts/desktop-ckjr-environment.mjs'
import { desktopCkjrHostEnvironment, resolveDesktopCkjrOrigins } from '../src/ckjr-origins.ts'

const ORIGINS = { CKJR_AUTH_ORIGIN: 'https://auth.example.com', CKJR_GATEWAY_ORIGIN: 'https://gateway.example.com' }

it('resolves both CKJR origins from file-owned release settings', () => {
  expect(resolveDesktopCkjrEnvironment(ORIGINS))
    .toEqual({ authOrigin: 'https://auth.example.com', gatewayOrigin: 'https://gateway.example.com' })
  expect(resolveDesktopCkjrEnvironment({ ...ORIGINS, CKJR_AUTH_ORIGIN: 'https://auth.example.com/' }))
    .toMatchObject({ authOrigin: 'https://auth.example.com' })
})

it.each([undefined, '', 'http://auth.example.com', 'https://user:secret@auth.example.com',
  'https://auth.example.com/api', 'https://auth.example.com/?secret=value'])('rejects invalid auth origin %s', (value) => {
  expect(() => resolveDesktopCkjrEnvironment({ ...ORIGINS, CKJR_AUTH_ORIGIN: value })).toThrow('CKJR_AUTH_ORIGIN')
  expect(() => resolveDesktopCkjrEnvironment({ ...ORIGINS, CKJR_AUTH_ORIGIN: value })).not.toThrow('secret=value')
})

it('requires the gateway origin as well', () => {
  expect(() => resolveDesktopCkjrEnvironment({ CKJR_AUTH_ORIGIN: ORIGINS.CKJR_AUTH_ORIGIN })).toThrow('CKJR_GATEWAY_ORIGIN')
})

it('accepts the packaged manifest field and the development environment alike', () => {
  const origins = { authOrigin: 'https://auth.example.com', gatewayOrigin: 'https://gateway.example.com' }
  expect(resolveDesktopCkjrOrigins(origins)).toEqual(origins)
  expect(() => resolveDesktopCkjrOrigins(undefined)).toThrow('carries no deployment origins')
  expect(() => resolveDesktopCkjrOrigins({ authOrigin: 'https://auth.example.com' })).toThrow('gatewayOrigin')
  expect(() => resolveDesktopCkjrOrigins({ authOrigin: 'http://auth.example.com', gatewayOrigin: origins.gatewayOrigin }))
    .toThrow('must be an HTTPS origin')
  expect(() => resolveDesktopCkjrOrigins({ authOrigin: origins.authOrigin, gatewayOrigin: 'https://gateway.example.com/v1' }))
    .toThrow('without credentials, path, query, or fragment')
})

it('names the Host variables the bundled plugin patches read', () => {
  expect(desktopCkjrHostEnvironment({ authOrigin: 'https://auth.example.com', gatewayOrigin: 'https://gateway.example.com' }))
    .toEqual({ CKJR_AUTH_ORIGIN: 'https://auth.example.com', CKJR_GATEWAY_ORIGIN: 'https://gateway.example.com' })
})
