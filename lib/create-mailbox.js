/** @typedef {import('./types').SoundingMailbox} SoundingMailbox */
/** @typedef {import('./types').SoundingMailMessage} SoundingMailMessage */

/**
 * @returns {SoundingMailbox}
 */
function createMailbox() {
  /** @type {SoundingMailMessage[]} */
  const messages = []

  return {
    /**
     * @param {SoundingMailMessage} message
     * @returns {SoundingMailMessage}
     */
    capture(message) {
      const normalized = {
        capturedAt: new Date().toISOString(),
        ...message,
      }
      messages.push(normalized)
      return normalized
    },

    /**
     * @returns {SoundingMailMessage[]}
     */
    all() {
      return [...messages]
    },

    /**
     * @returns {SoundingMailMessage | undefined}
     */
    latest() {
      return messages.at(-1)
    },

    /**
     * @returns {void}
     */
    clear() {
      messages.length = 0
    },
  }
}

module.exports = { createMailbox }
