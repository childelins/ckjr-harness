/** Deployment origins the bundled CKJR plugins read from the Host environment. */
export interface DesktopCkjrEnvironment {
  authOrigin: string
  gatewayOrigin: string
}

/**
 * Resolve both CKJR deployment origins from file-owned release settings.
 * @param environment File-owned release settings; both origins are required.
 * @returns Validated HTTPS origins without credentials, path, query, or fragment.
 */
export function resolveDesktopCkjrEnvironment(environment: NodeJS.ProcessEnv): DesktopCkjrEnvironment
