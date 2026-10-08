/** Deployment origins the bundled CKJR plugins read from the Host environment. */

/** Origins a Host launch carries so the bundled CKJR account and LLM rows can load. */
export interface DesktopCkjrOrigins {
  readonly authOrigin: string
  readonly gatewayOrigin: string
}

/**
 * Reject a value that is not a bare HTTPS origin.
 * @param value - Manifest field or development environment value.
 * @param field - Field name reported in the failure.
 * @returns the origin without credentials, path, query, or fragment.
 */
function httpsOrigin(value: unknown, field: string): string {
  let url: URL
  try {
    url = new URL(typeof value === 'string' ? value : '')
  }
  catch {
    throw new Error(`desktop CKJR origins: ${field} must be an absolute HTTPS origin`)
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
    || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(`desktop CKJR origins: ${field} must be an HTTPS origin without credentials, path, query, or fragment`)
  }
  return url.origin
}

/**
 * Read the CKJR deployment origins this build carries.
 * @param input - Packaged manifest field, or the development environment's two variables.
 * @returns both validated origins.
 * @throws Error when the build carries no usable origins, instead of launching a Host whose account plugin cannot load.
 */
export function resolveDesktopCkjrOrigins(input: unknown): DesktopCkjrOrigins {
  if (typeof input !== 'object' || input === null) {
    throw new Error('desktop CKJR origins: this build carries no deployment origins')
  }
  return {
    authOrigin: httpsOrigin('authOrigin' in input ? input.authOrigin : undefined, 'authOrigin'),
    gatewayOrigin: httpsOrigin('gatewayOrigin' in input ? input.gatewayOrigin : undefined, 'gatewayOrigin'),
  }
}

/**
 * Environment additions a Host launch needs for the bundled CKJR plugins.
 *
 * The bundled `ckjr-account` and `ckjr-llm` rows read exactly these two names through
 * `!!js process.env.*` expressions, so a rename here breaks the shipped patch.
 * @param origins - Origins resolved for this build.
 * @returns the two variables the bundled plugin patches read.
 */
export function desktopCkjrHostEnvironment(origins: DesktopCkjrOrigins): NodeJS.ProcessEnv {
  return { CKJR_AUTH_ORIGIN: origins.authOrigin, CKJR_GATEWAY_ORIGIN: origins.gatewayOrigin }
}
