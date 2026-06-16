const { AsyncLocalStorage } = require('node:async_hooks')

/** @typedef {import('./types').SoundingMailbox} SoundingMailbox */
/** @typedef {import('./types').SoundingRuntime} SoundingRuntime */

/** @type {AsyncLocalStorage<{ runtime?: SoundingRuntime, mailbox?: SoundingMailbox, getConfig?: () => any }>} */
const trialContextStorage = new AsyncLocalStorage()

/**
 * @template T
 * @param {{ runtime?: SoundingRuntime, mailbox?: SoundingMailbox, getConfig?: () => any }} context
 * @param {() => T | Promise<T>} handler
 * @returns {T | Promise<T>}
 */
function runWithTrialContext(context, handler) {
  return trialContextStorage.run(context, handler)
}

/**
 * @returns {{ runtime?: SoundingRuntime, mailbox?: SoundingMailbox, getConfig?: () => any } | null}
 */
function getTrialContext() {
  return trialContextStorage.getStore() || null
}

module.exports = {
  getTrialContext,
  runWithTrialContext,
}
