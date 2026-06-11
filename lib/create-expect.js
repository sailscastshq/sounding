const assert = require('node:assert/strict')

const { createSoundingError } = require('./create-error')

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
 * @returns {boolean}
 */
function isMailbox(actual) {
  return Boolean(
    actual &&
      typeof actual === 'object' &&
      typeof actual.all === 'function' &&
      typeof actual.latest === 'function'
  )
}

/**
 * @param {any} actual
 * @returns {boolean}
 */
function isMailMessage(actual) {
  return Boolean(
    actual &&
      typeof actual === 'object' &&
      !Array.isArray(actual) &&
      ('to' in actual ||
        'subject' in actual ||
        'template' in actual ||
        'ctaUrl' in actual ||
        'status' in actual)
  )
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

  if (isMailbox(actual) || isMailMessage(actual)) {
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
 * @returns {Error}
 */
function createResponseSessionUnavailableError() {
  return createSoundingError({
    code: 'E_SOUNDING_RESPONSE_SESSION_UNAVAILABLE',
    name: 'SoundingExpectationError',
    message:
      'Sounding session assertions require a virtual request response. HTTP responses do not expose server-side session state, so use the virtual transport or assert cookies, headers, and follow-up behavior instead.',
  })
}

/**
 * @param {any} actual
 * @returns {any}
 */
function resolveResponseSession(actual) {
  if (actual?.session && typeof actual.session === 'object' && !Array.isArray(actual.session)) {
    return actual.session
  }

  throw createResponseSessionUnavailableError()
}

/**
 * @param {any[]} messages
 * @param {any} expected
 * @returns {boolean}
 */
function flashMessagesMatch(messages, expected) {
  if (expected === undefined) {
    return messages.length > 0
  }

  if (Array.isArray(expected)) {
    return partiallyMatches(messages, expected)
  }

  return messages.some((message) => partiallyMatches(message, expected))
}

/**
 * @param {any} value
 * @returns {string}
 */
function describeExpected(value) {
  if (value instanceof RegExp) {
    return String(value)
  }

  if (typeof value === 'function') {
    return value.name ? `[Function: ${value.name}]` : '[Function]'
  }

  return JSON.stringify(value, (_key, nested) => {
    if (nested instanceof RegExp) {
      return String(nested)
    }

    if (typeof nested === 'function') {
      return nested.name ? `[Function: ${nested.name}]` : '[Function]'
    }

    return nested
  })
}

/**
 * @param {string} path
 * @param {any} expected
 * @returns {string}
 */
function formatExpectation(path, expected) {
  if (expected === undefined) {
    return `\`${path}\` to be present`
  }

  return `\`${path}\` to match ${describeExpected(expected)}`
}

/**
 * @param {any} target
 * @returns {any[]}
 */
function resolveMailboxMessages(target) {
  if (isMailbox(target)) {
    return target.all()
  }

  throw new TypeError('Sounding expect().toHaveSentMail() requires a Sounding mailbox.')
}

/**
 * @param {any} target
 * @returns {any}
 */
function resolveMailMessage(target) {
  if (isMailMessage(target)) {
    return target
  }

  throw new TypeError('Sounding expect().toHaveCtaUrl() requires a captured mail message.')
}

/**
 * @param {any[]} actual
 * @param {any} expected
 * @returns {boolean}
 */
function listContainsPartial(actual, expected) {
  if (Array.isArray(expected)) {
    return partiallyMatches(actual, expected)
  }

  return actual.some((entry) => partiallyMatches(entry, expected))
}

/**
 * @param {any} message
 * @param {any} expected
 * @returns {boolean}
 */
function mailMatches(message, expected = {}) {
  if (typeof expected === 'function' || expected instanceof RegExp) {
    return partiallyMatches(message, expected)
  }

  return Object.entries(expected).every(([key, value]) => {
    const actualValue = getPath(message, key)

    if (Array.isArray(actualValue)) {
      return listContainsPartial(actualValue, value)
    }

    return partiallyMatches(actualValue, value)
  })
}

/**
 * @param {any} message
 * @returns {any}
 */
function summarizeMailMessage(message) {
  return {
    to: message?.to,
    subject: message?.subject,
    template: message?.template,
    status: message?.status,
    ctaUrl: message?.ctaUrl,
  }
}

/**
 * @param {any[]} messages
 * @returns {string}
 */
function summarizeMailMessages(messages) {
  return describeExpected(messages.map(summarizeMailMessage))
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

    toHaveSentCount(expected) {
      const messages = resolveMailboxMessages(actual)
      assert.strictEqual(
        messages.length,
        expected,
        `Expected mailbox to have sent ${expected} message(s), received ${messages.length}. Captured mail: ${summarizeMailMessages(messages)}.`
      )
    },

    toHaveSentMail(expected = {}) {
      const messages = resolveMailboxMessages(actual)

      assert.ok(
        messages.some((message) => mailMatches(message, expected)),
        `Expected mailbox to have sent mail matching ${describeExpected(expected)}. Captured mail: ${summarizeMailMessages(messages)}.`
      )
    },

    toHaveCtaUrl(expected) {
      const message = resolveMailMessage(actual)
      const ctaUrl = message.ctaUrl

      if (expected === undefined) {
        assert.notStrictEqual(ctaUrl, undefined, 'Expected captured mail to have a CTA URL.')
        return
      }

      assertPartialMatch(
        ctaUrl,
        expected,
        `Expected captured mail CTA URL to match ${describeExpected(expected)}, received ${describeExpected(ctaUrl)}.`
      )
    },

    toHaveSession(path, expected) {
      const session = resolveResponseSession(actual)
      const value = getPath(session, path)

      if (expected === undefined) {
        assert.notStrictEqual(value, undefined, `Expected session ${formatExpectation(path)}.`)
        return
      }

      assertPartialMatch(
        value,
        expected,
        `Expected session ${formatExpectation(path, expected)}, received ${describeExpected(value)}.`
      )
    },

    toHaveFlash(type, expected) {
      const session = resolveResponseSession(actual)
      const messages = session.__soundingFlashStore?.[type] || []

      assert.ok(
        flashMessagesMatch(messages, expected),
        expected === undefined
          ? `Expected flash \`${type}\` to be present.`
          : `Expected flash \`${type}\` to match ${describeExpected(expected)}, received ${describeExpected(messages)}.`
      )
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
      toHaveSentMail(expected = {}) {
        const messages = resolveMailboxMessages(actual)

        assert.ok(
          !messages.some((message) => mailMatches(message, expected)),
          `Expected mailbox not to have sent mail matching ${describeExpected(expected)}. Captured mail: ${summarizeMailMessages(messages)}.`
        )
      },

      toHaveCtaUrl(expected) {
        const message = resolveMailMessage(actual)
        const ctaUrl = message.ctaUrl

        if (expected === undefined) {
          assert.strictEqual(ctaUrl, undefined, 'Expected captured mail not to have a CTA URL.')
          return
        }

        assert.ok(
          !partiallyMatches(ctaUrl, expected),
          `Expected captured mail CTA URL not to match ${describeExpected(expected)}.`
        )
      },

      toHaveSession(path, expected) {
        const session = resolveResponseSession(actual)
        const value = getPath(session, path)

        if (expected === undefined) {
          assert.strictEqual(value, undefined, `Expected session not to include \`${path}\`.`)
          return
        }

        assert.ok(
          !partiallyMatches(value, expected),
          `Expected session \`${path}\` not to match ${describeExpected(expected)}.`
        )
      },

      toHaveFlash(type, expected) {
        const session = resolveResponseSession(actual)
        const messages = session.__soundingFlashStore?.[type] || []

        assert.ok(
          !flashMessagesMatch(messages, expected),
          expected === undefined
            ? `Expected flash \`${type}\` not to be present.`
            : `Expected flash \`${type}\` not to match ${describeExpected(expected)}.`
        )
      },

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
