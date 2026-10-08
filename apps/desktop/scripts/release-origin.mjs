/** Reject release settings that are not bare HTTPS origins. */

/**
 * Validate one release origin, naming the setting in every failure.
 * @param {unknown} value Configured value; a missing setting fails the same way an unparsable one does.
 * @param {string} name Setting name reported to the operator.
 * @returns {string} Origin without credentials, path, query, or fragment.
 */
export function releaseOrigin(value, name) {
  let url
  try { url = new URL(value) } catch { throw new Error(`desktop package: ${name} requires an HTTPS origin`) }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`desktop package: ${name} requires an HTTPS origin without credentials, path, query, or fragment`)
  }
  return url.origin
}
