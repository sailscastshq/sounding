/** @typedef {import('./types').AnyRecord} AnyRecord */

/**
 * Sounding error codes are a lightweight diagnostic contract for tests,
 * reporters, and docs. Keep messages human-readable, and use code/details for
 * stable programmatic handling.
 *
 * @template {AnyRecord} TDetails
 * @param {{
 *   code: string,
 *   message: string,
 *   details?: TDetails,
 *   cause?: unknown,
 *   name?: string,
 * }} input
 * @returns {Error & { code: string, details: TDetails, [key: string]: any } & TDetails}
 */
function createSoundingError({ code, message, details, cause, name }) {
  const resolvedDetails = /** @type {TDetails} */ (details || {})
  const error = /** @type {Error & { code: string, details: TDetails, [key: string]: any } & TDetails} */ (
    cause === undefined ? new Error(message) : new Error(message, { cause })
  )

  Object.assign(error, resolvedDetails)
  error.name = name || 'SoundingError'
  error.message = message
  error.code = code
  error.details = /** @type {TDetails} */ ({ ...resolvedDetails })

  return error
}

module.exports = {
  createSoundingError,
}
