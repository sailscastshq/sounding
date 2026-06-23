const { createSoundingError } = require('./create-error')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {SoundingSailsApp} sails
 * @param {AnyRecord} session
 * @returns {Promise<string | null>}
 */
async function createSessionCookie(sails, session) {
  if (
    !sails?.session ||
    typeof sails.session.generateNewSidCookie !== 'function' ||
    typeof sails.session.parseSessionIdFromCookie !== 'function' ||
    typeof sails.session.set !== 'function'
  ) {
    return null
  }

  const cookie = sails.session.generateNewSidCookie()
  const sid = sails.session.parseSessionIdFromCookie(cookie)

  await new Promise((resolve, reject) => {
    sails.session.set(
      sid,
      {
        cookie: {
          httpOnly: true,
          path: '/',
        },
        ...session,
      },
      (error) => {
        if (error) {
          reject(
            createSoundingError({
              code: 'E_SOUNDING_SESSION_COOKIE_FAILED',
              name: 'SoundingSessionError',
              message: 'Sounding could not create a Sails session cookie.',
              cause: error,
            })
          )
          return
        }

        resolve()
      }
    )
  })

  return cookie
}

module.exports = {
  createSessionCookie,
}
