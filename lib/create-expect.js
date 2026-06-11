const assert = require('node:assert/strict')

/** @typedef {import('./types').SoundingExpect} SoundingExpect */
/** @typedef {import('./types').SoundingExpectation} SoundingExpectation */

/**
 * @param {any} target
 * @param {string} path
 * @returns {any}
 */
function getPath(target, path) {
  return path.split('.').reduce((current, segment) => current?.[segment], target)
}

/**
 * @param {any} actual
 * @param {string} name
 * @returns {any}
 */
function getHeader(actual, name) {
  if (typeof actual?.header === 'function') {
    return actual.header(name)
  }

  if (typeof actual?.headers?.get === 'function') {
    return actual.headers.get(name)
  }

  return actual?.headers?.[name]
}

/**
 * @param {any} actual
 * @returns {any}
 */
function resolveStructuredValue(actual) {
  if (actual?.data !== undefined) {
    return actual.data
  }

  return actual
}

/**
 * @param {any} actual
 * @returns {boolean}
 */
function shouldUseFallback(actual) {
  if (typeof actual?.receive === 'function' && typeof actual?.events === 'function') {
    return false
  }

  return Boolean(
    actual &&
      typeof actual === 'object' &&
      !Array.isArray(actual) &&
      actual.status === undefined &&
      actual.data === undefined &&
      typeof actual.header !== 'function' &&
      typeof actual.headers?.get !== 'function'
  )
}

/**
 * @param {any} actual
 * @param {any} expected
 * @returns {boolean}
 */
function partiallyMatches(actual, expected) {
  if (expected instanceof RegExp) {
    return expected.test(String(actual))
  }

  if (typeof expected === 'function') {
    return Boolean(expected(actual))
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) {
      return false
    }

    return expected.every((entry, index) => partiallyMatches(actual[index], entry))
  }

  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      return false
    }

    return Object.entries(expected).every(([key, value]) => partiallyMatches(actual[key], value))
  }

  return Object.is(actual, expected)
}

/**
 * @param {any} actual
 * @param {any} expected
 * @param {string} message
 */
function assertPartialMatch(actual, expected, message) {
  if (expected === undefined) {
    assert.notStrictEqual(actual, undefined)
    return
  }

  assert.ok(partiallyMatches(actual, expected), message)
}

/**
 * @param {any} actual
 * @param {{ fallback?: (actual: any) => any }} [options]
 * @returns {SoundingExpectation | any}
 */
function createExpect(actual, { fallback } = {}) {
  if (fallback && shouldUseFallback(actual)) {
    return fallback(actual)
  }

  return {
    toBe(expected) {
      assert.strictEqual(actual, expected)
    },

    toEqual(expected) {
      assert.deepStrictEqual(actual, expected)
    },

    toContain(expected) {
      if (typeof actual === 'string') {
        assert.ok(actual.includes(expected))
        return
      }

      if (Array.isArray(actual)) {
        assert.ok(actual.includes(expected))
        return
      }

      throw new TypeError('Sounding expect().toContain() only supports strings and arrays in v0.0.1.')
    },

    toMatch(expected) {
      if (expected instanceof RegExp) {
        assert.match(actual, expected)
        return
      }

      assert.ok(String(actual).includes(String(expected)))
    },

    toBeTruthy() {
      assert.ok(actual)
    },

    toBeFalsy() {
      assert.ok(!actual)
    },

    toBeDefined() {
      assert.notStrictEqual(actual, undefined)
    },

    toHaveStatus(expected) {
      assert.strictEqual(actual?.status, expected)
    },

    toHaveHeader(name, expected) {
      const header = getHeader(actual, name)
      assert.notStrictEqual(header, null)
      assert.notStrictEqual(header, undefined)

      if (expected !== undefined) {
        assert.strictEqual(header, expected)
      }
    },

    toRedirectTo(expected) {
      const location = getHeader(actual, 'location')
      assert.strictEqual(location, expected)
    },

    toHaveJsonPath(path, expected) {
      const value = getPath(resolveStructuredValue(actual), path)
      assert.deepStrictEqual(value, expected)
    },

    toBeInertiaPage(component) {
      const value = resolveStructuredValue(actual)
      assert.strictEqual(value?.component, component)
    },

    toHaveProp(path, expected) {
      const value = getPath(resolveStructuredValue(actual)?.props, path)
      assert.deepStrictEqual(value, expected)
    },

    toMatchProp(path, expected) {
      const value = getPath(resolveStructuredValue(actual)?.props, path)

      if (expected instanceof RegExp) {
        assert.match(String(value), expected)
        return
      }

      assert.ok(String(value).includes(String(expected)))
    },

    toHaveSharedProp(path, expected) {
      const value = getPath(resolveStructuredValue(actual)?.props, path)
      assert.deepStrictEqual(value, expected)
    },

    toHaveValidationError(path, expected) {
      const value = getPath(resolveStructuredValue(actual)?.props?.errors, path)
      assert.notStrictEqual(value, undefined)

      if (expected !== undefined) {
        assert.deepStrictEqual(value, expected)
      }
    },

    async toReceive(event, expected, options) {
      if (typeof actual?.receive !== 'function') {
        throw new TypeError('Sounding expect().toReceive() requires a Sounding socket client.')
      }

      const payload = await actual.receive(event, options)
      assertPartialMatch(
        payload,
        expected,
        `Expected socket event \`${event}\` to match ${JSON.stringify(expected)}, received ${JSON.stringify(payload)}.`
      )
    },

    toHaveReceived(event, expected) {
      if (typeof actual?.events !== 'function') {
        throw new TypeError('Sounding expect().toHaveReceived() requires a Sounding socket client.')
      }

      const payloads = actual.events(event)
      assert.ok(payloads.length > 0, `Expected socket to have received \`${event}\`.`)

      if (expected !== undefined) {
        assert.ok(
          payloads.some((payload) => partiallyMatches(payload, expected)),
          `Expected received socket event \`${event}\` to match ${JSON.stringify(expected)}.`
        )
      }
    },

    not: {
      async toReceive(event, expected, options = {}) {
        if (typeof actual?.receive !== 'function') {
          throw new TypeError('Sounding expect().not.toReceive() requires a Sounding socket client.')
        }

        const timeout = options.timeout || 50

        try {
          const payload = await actual.receive(event, { ...options, timeout })
          if (expected === undefined || partiallyMatches(payload, expected)) {
            assert.fail(`Expected socket not to receive \`${event}\`, but it did.`)
          }
        } catch (error) {
          if (error?.code === 'E_SOUNDING_SOCKET_EVENT_TIMEOUT') {
            return
          }

          throw error
        }
      },
    },
  }
}

/**
 * @param {(actual: any) => any} fallback
 * @returns {SoundingExpect}
 */
createExpect.withFallback = function withFallback(fallback) {
  function soundingExpect(actual) {
    return createExpect(actual, { fallback })
  }

  soundingExpect.withFallback = createExpect.withFallback
  return soundingExpect
}

module.exports = { createExpect }
