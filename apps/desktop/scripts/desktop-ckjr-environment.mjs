/** Resolve the merchant SaaS and gateway origins the bundled CKJR plugins read at Host startup. */

import { releaseOrigin } from './release-origin.mjs'

/**
 * Resolve both CKJR deployment origins from file-owned release settings.
 *
 * The bundled `ckjr-account` and `ckjr-llm` rows read these two values from the Host
 * environment, so a build without them ships an account plugin that fails to load.
 * @param {NodeJS.ProcessEnv} environment File-owned release settings.
 * @returns {{ authOrigin: string, gatewayOrigin: string }} Origins without credentials, path, query, or fragment.
 */
export function resolveDesktopCkjrEnvironment(environment) {
  return {
    authOrigin: releaseOrigin(environment.CKJR_AUTH_ORIGIN, 'CKJR_AUTH_ORIGIN'),
    gatewayOrigin: releaseOrigin(environment.CKJR_GATEWAY_ORIGIN, 'CKJR_GATEWAY_ORIGIN'),
  }
}
