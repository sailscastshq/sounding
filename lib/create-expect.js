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
