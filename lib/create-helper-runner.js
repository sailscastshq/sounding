/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingHelperRunner} SoundingHelperRunner */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {SoundingSailsApp} sails
 * @param {string} identity
 * @returns {any}
 */
function resolveHelper(sails, identity) {
  return identity
    .split('.')
    .reduce((current, segment) => current?.[segment], sails.helpers)
}

/**
 * @param {{ sails: SoundingSailsApp }} input
 * @returns {SoundingHelperRunner}
 */
function createHelperRunner({ sails }) {
  /**
   * @param {string} identity
   * @param {AnyRecord} [inputs]
   * @returns {Promise<any>}
   */
  async function invoke(identity, inputs = {}) {
    const helper = resolveHelper(sails, identity)

    if (!helper) {
      throw new Error(`Unknown Sounding helper: ${identity}`)
    }

    if (typeof helper.with === 'function') {
      return helper.with(inputs)
    }

    if (typeof helper === 'function') {
      return helper(inputs)
    }

    throw new Error(`Sounding helper \`${identity}\` is not callable.`)
  }

  /**
   * @param {string[]} [path]
   * @returns {SoundingHelperRunner}
   */
  function buildProxy(path = []) {
    const callable = async (...args) => {
      if (path.length === 0) {
        const [identity, inputs = {}] = args
        return invoke(identity, inputs)
      }

      const [inputs = {}] = args
      return invoke(path.join('.'), inputs)
    }

    return new Proxy(callable, {
      get(_target, property) {
        if (property === 'path') {
          return path.join('.')
        }

        if (typeof property !== 'string') {
          return undefined
        }

        return buildProxy([...path, property])
      },
    })
  }

  return buildProxy()
}

module.exports = { createHelperRunner }
