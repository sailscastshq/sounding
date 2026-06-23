const assert = require('node:assert/strict')

const {
  browserPageCollectionEntryHasSmoke,
  failWithBrowserDiagnostics,
  getBrowserPageCollectionEntries,
  getBrowserPageState,
  getBrowserPageText,
  getBrowserPageUrl,
  isSoundingBrowserPage,
  isSoundingBrowserPageCollection,
} = require('./create-browser-page')
const { createSoundingError } = require('./create-error')
const { matchVisualSnapshot } = require('./visual-snapshots')

/** @typedef {import('./types').SoundingExpect} SoundingExpect */
/** @typedef {import('./types').SoundingExpectation} SoundingExpectation */

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatUnknown(value) {
  if (value instanceof Error) {
    return value.message
  }

  return String(value)
}

/**
 * @param {any} target
 * @param {string} path
 * @returns {any}
 */
function getPath(target, path) {
  return path.split('.').reduce((current, segment) => current?.[segment], target)
}

/**
 * @param {any} headers
 * @param {string} name
 * @returns {any}
 */
function getHeaderValue(headers, name) {
  if (!headers) {
    return undefined
  }

  if (typeof headers.get === 'function') {
    const value = headers.get(name)
    return value === null ? undefined : value
  }

  if (headers[name] !== undefined) {
    return headers[name]
  }

  const normalizedName = name.toLowerCase()
  const matchingEntry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === normalizedName
  )

  return matchingEntry?.[1]
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

  return getHeaderValue(actual?.headers, name)
}

/**
 * @param {any} actual
 * @param {string} name
 * @returns {any}
 */
function getRequestHeader(actual, name) {
  return getHeaderValue(actual?.request?.headers, name)
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
  if (isSoundingBrowserPage(actual) || isSoundingBrowserPageCollection(actual)) {
    return false
  }

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
 * @param {any} headers
 * @returns {Array<[string, string]>}
 */
function getHeaderEntries(headers) {
  if (!headers) {
    return []
  }

  if (typeof headers.forEach === 'function') {
    const entries = []
    headers.forEach((value, key) => {
      entries.push([key, value])
    })
    return entries
  }

  return Object.entries(headers).map(([key, value]) => [key, String(value)])
}

/**
 * @param {any} headers
 * @returns {string}
 */
function summarizeHeaders(headers) {
  const entries = getHeaderEntries(headers)
  const limit = usesVerboseDiagnostics() ? entries.length : 6
  const visibleEntries = entries.slice(0, limit).map(([key, value]) => `${key}: ${value}`)

  if (entries.length > visibleEntries.length) {
    visibleEntries.push(`... ${entries.length - visibleEntries.length} more`)
  }

  return visibleEntries.join(', ')
}

/**
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}...`
}

/**
 * @param {any} actual
 * @returns {string}
 */
function summarizeResponseBody(actual) {
  const body = actual?.body || (actual?.data === undefined ? '' : describeExpected(actual.data))
  const limit = usesVerboseDiagnostics() ? Infinity : 500
  return truncate(String(body).replace(/\s+/g, ' ').trim(), limit)
}

/**
 * @returns {boolean}
 */
function usesVerboseDiagnostics() {
  return process.env.SOUNDING_DIAGNOSTICS === 'verbose'
}

/**
 * @param {any} actual
 * @returns {string}
 */
function formatResponseDiagnostics(actual) {
  const request = actual?.request
  const hasResponseContext =
    Boolean(request) || actual?.status !== undefined || actual?.url !== undefined

  if (!hasResponseContext) {
    return ''
  }

  const lines = []

  if (request) {
    const transport = request.transport ? ` (${request.transport})` : ''
    const url = request.url && request.url !== request.target ? ` -> ${request.url}` : ''
    lines.push(`Request: ${request.method} ${request.target}${transport}${url}`)
    const requestHeaders = summarizeHeaders(request.headers)
    if (requestHeaders) {
      lines.push(`Request headers: ${requestHeaders}`)
    }
  } else if (actual?.url) {
    lines.push(`URL: ${actual.url}`)
  }

  if (actual?.status !== undefined) {
    const statusText = actual.statusText ? ` ${actual.statusText}` : ''
    lines.push(`Response: ${actual.status}${statusText}`)
  }

  const headers = summarizeHeaders(actual?.headers)
  if (headers) {
    lines.push(`Headers: ${headers}`)
  }

  const body = summarizeResponseBody(actual)
  if (body) {
    lines.push(`Body: ${body}`)
  }

  if (lines.length === 0) {
    return ''
  }

  return `\n\nSounding response diagnostics:\n${lines.map((line) => `- ${line}`).join('\n')}`
}

/**
 * @param {string} message
 * @param {any} actual
 */
function failWithResponseDiagnostics(message, actual) {
  assert.fail(`${message}${formatResponseDiagnostics(actual)}`)
}

/**
 * @param {any} value
 * @param {any} expected
 * @param {string} message
 * @param {any} actual
 */
function assertDeepEqualWithResponseDiagnostics(value, expected, message, actual) {
  try {
    assert.deepStrictEqual(value, expected)
  } catch (_error) {
    failWithResponseDiagnostics(message, actual)
  }
}

/**
 * @param {any} actual
 * @returns {any}
 */
function resolveInertiaPage(actual) {
  return resolveStructuredValue(actual) || {}
}

/**
 * @param {any} actual
 * @returns {any}
 */
function resolveInertiaProps(actual) {
  return resolveInertiaPage(actual)?.props || {}
}

/**
 * @param {any} actual
 * @returns {any}
 */
function resolveSharedInertiaProps(actual) {
  const page = resolveInertiaPage(actual)
  return page?.sharedProps || page?.shared || page?.props?.shared || page?.props || {}
}

/**
 * @param {any} actual
 * @returns {any}
 */
function resolveInertiaErrors(actual) {
  return resolveInertiaProps(actual)?.errors || {}
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function hasEntries(value) {
  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0
  }

  return Boolean(value)
}

/**
 * @param {any} source
 * @param {string} path
 * @param {any} expected
 * @param {string} label
 * @param {any} actual
 */
function assertInertiaPath(source, path, expected, label, actual) {
  const value = getPath(source, path)

  if (expected === undefined) {
    if (value === undefined) {
      failWithResponseDiagnostics(`Expected ${label} \`${path}\` to be present.`, actual)
    }
    return
  }

  if (!partiallyMatches(value, expected)) {
    failWithResponseDiagnostics(
      `Expected ${label} ${formatExpectation(path, expected)}, received ${describeExpected(value)}.`,
      actual
    )
  }
}

/**
 * @param {any} source
 * @param {string} path
 * @param {any} expected
 * @param {string} label
 * @param {any} actual
 */
function assertInertiaPathAbsent(source, path, expected, label, actual) {
  const value = getPath(source, path)

  if (expected === undefined) {
    if (value !== undefined) {
      failWithResponseDiagnostics(
        `Expected ${label} \`${path}\` to be absent, received ${describeExpected(value)}.`,
        actual
      )
    }
    return
  }

  if (partiallyMatches(value, expected)) {
    failWithResponseDiagnostics(
      `Expected ${label} \`${path}\` not to match ${describeExpected(expected)}.`,
      actual
    )
  }
}

/**
 * @param {any} source
 * @param {Record<string, any>} expected
 * @param {string} matcherName
 * @param {string} pathLabel
 * @param {any} actual
 */
function assertInertiaPathMap(source, expected, matcherName, pathLabel, actual) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new TypeError(`Sounding expect().${matcherName}() requires an object of prop paths.`)
  }

  for (const [path, value] of Object.entries(expected)) {
    assertInertiaPath(source, path, value, pathLabel, actual)
  }
}

/**
 * @param {any} value
 * @returns {number | null}
 */
function countCollection(value) {
  if (Array.isArray(value)) {
    return value.length
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length
  }

  return null
}

/**
 * @param {any} actual
 * @param {string} path
 * @param {number} expected
 */
function assertInertiaPropCount(actual, path, expected) {
  const value = getPath(resolveInertiaProps(actual), path)
  const count = countCollection(value)

  if (count === null) {
    failWithResponseDiagnostics(
      `Expected Inertia prop \`${path}\` to be an array or object with ${expected} item(s), received ${describeExpected(value)}.`,
      actual
    )
  }

  if (count !== expected) {
    failWithResponseDiagnostics(
      `Expected Inertia prop \`${path}\` to have ${expected} item(s), received ${count}.`,
      actual
    )
  }
}

/**
 * @param {any} actual
 * @param {string[]} expected
 */
function assertOnlyInertiaProps(actual, expected) {
  if (!Array.isArray(expected)) {
    throw new TypeError('Sounding expect().toHaveOnlyInertiaProps() requires an array of top-level prop names.')
  }

  const actualKeys = Object.keys(resolveInertiaProps(actual)).sort()
  const expectedKeys = [...expected].sort()

  assertDeepEqualWithResponseDiagnostics(
    actualKeys,
    expectedKeys,
    `Expected Inertia props to include only ${describeExpected(expectedKeys)}, received ${describeExpected(actualKeys)}.`,
    actual
  )
}

/**
 * @param {string | string[]} value
 * @returns {string[]}
 */
function normalizeHeaderList(value) {
  if (Array.isArray(value)) {
    return value.map(String)
  }

  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * @param {any} actual
 * @param {string} name
 * @param {string[]} expected
 * @param {string} label
 */
function assertPartialReloadList(actual, name, expected, label) {
  if (!Array.isArray(expected)) {
    throw new TypeError(`Sounding expect().toHaveInertiaPartialReload() requires \`${label}\` to be an array.`)
  }

  const value = getRequestHeader(actual, name)
  const actualList = normalizeHeaderList(value)

  assertDeepEqualWithResponseDiagnostics(
    actualList,
    expected,
    `Expected Inertia partial reload \`${label}\` to equal ${describeExpected(expected)}, received ${describeExpected(actualList)}.`,
    actual
  )
}

/**
 * @param {any} actual
 * @param {{ component?: string, only?: string[], except?: string[], reset?: string[], version?: string, errorBag?: string }} [expected]
 */
function assertInertiaPartialReload(actual, expected = {}) {
  const headerNames = [
    'x-inertia-partial-component',
    'x-inertia-partial-data',
    'x-inertia-partial-except',
    'x-inertia-reset',
  ]
  const hasPartialReloadHeader = headerNames.some((name) => getRequestHeader(actual, name) !== undefined)

  if (!hasPartialReloadHeader) {
    failWithResponseDiagnostics('Expected request to include Inertia partial reload headers.', actual)
  }

  if (expected.component !== undefined) {
    const component = getRequestHeader(actual, 'x-inertia-partial-component')
    if (component !== expected.component) {
      failWithResponseDiagnostics(
        `Expected Inertia partial reload component ${describeExpected(expected.component)}, received ${describeExpected(component)}.`,
        actual
      )
    }
  }

  if (expected.only !== undefined) {
    assertPartialReloadList(actual, 'x-inertia-partial-data', expected.only, 'only')
  }

  if (expected.except !== undefined) {
    assertPartialReloadList(actual, 'x-inertia-partial-except', expected.except, 'except')
  }

  if (expected.reset !== undefined) {
    assertPartialReloadList(actual, 'x-inertia-reset', expected.reset, 'reset')
  }

  if (expected.version !== undefined) {
    const version = getRequestHeader(actual, 'x-inertia-version')
    if (version !== expected.version) {
      failWithResponseDiagnostics(
        `Expected Inertia version ${describeExpected(expected.version)}, received ${describeExpected(version)}.`,
        actual
      )
    }
  }

  if (expected.errorBag !== undefined) {
    const errorBag = getRequestHeader(actual, 'x-inertia-error-bag')
    if (errorBag !== expected.errorBag) {
      failWithResponseDiagnostics(
        `Expected Inertia error bag ${describeExpected(expected.errorBag)}, received ${describeExpected(errorBag)}.`,
        actual
      )
    }
  }
}

/**
 * @param {any} actual
 * @param {string | string[] | Record<string, any>} [expected]
 */
function assertInertiaErrors(actual, expected) {
  const errors = resolveInertiaErrors(actual)

  if (expected === undefined) {
    if (!hasEntries(errors)) {
      failWithResponseDiagnostics('Expected Inertia validation errors to be present.', actual)
    }
    return
  }

  if (typeof expected === 'string') {
    assertInertiaPath(errors, expected, undefined, 'Inertia validation error', actual)
    return
  }

  if (Array.isArray(expected)) {
    for (const path of expected) {
      assertInertiaPath(errors, path, undefined, 'Inertia validation error', actual)
    }
    return
  }

  if (expected && typeof expected === 'object') {
    for (const [path, value] of Object.entries(expected)) {
      assertInertiaPath(errors, path, value, 'Inertia validation error', actual)
    }
    return
  }

  throw new TypeError('Sounding expect().toHaveInertiaErrors() requires a string, array, object, or no argument.')
}

/**
 * @param {any} actual
 */
function assertNoInertiaErrors(actual) {
  const errors = resolveInertiaErrors(actual)

  if (hasEntries(errors)) {
    failWithResponseDiagnostics(
      `Expected Inertia validation errors to be empty, received ${describeExpected(errors)}.`,
      actual
    )
  }
}

/**
 * @param {string} actual
 * @param {string | RegExp} expected
 * @returns {boolean}
 */
function browserTextMatches(actual, expected) {
  if (expected instanceof RegExp) {
    return expected.test(actual)
  }

  return actual.includes(String(expected))
}

/**
 * @param {string | RegExp} expected
 * @returns {string}
 */
function describeBrowserText(expected) {
  return expected instanceof RegExp ? String(expected) : describeExpected(String(expected))
}

/**
 * @param {any} actual
 */
function assertBrowserPage(actual) {
  if (!isSoundingBrowserPage(actual)) {
    throw new TypeError('Sounding browser expectations require a Sounding browser page.')
  }
}

/**
 * @param {any} actual
 * @param {string | RegExp} expected
 * @param {boolean} [negated]
 */
async function assertBrowserText(actual, expected, negated = false) {
  assertBrowserPage(actual)
  const text = await getBrowserPageText(actual)
  const matches = browserTextMatches(text, expected)

  if (negated ? matches : !matches) {
    failWithBrowserDiagnostics(
      negated
        ? `Expected browser page not to show ${describeBrowserText(expected)}.`
        : `Expected browser page to show ${describeBrowserText(expected)}.`,
      actual
    )
  }
}

/**
 * @param {string} currentUrl
 * @param {string | RegExp} expected
 * @returns {boolean}
 */
function browserUrlMatches(currentUrl, expected) {
  if (expected instanceof RegExp) {
    return expected.test(currentUrl)
  }

  if (String(expected).startsWith('/')) {
    try {
      const parsed = new URL(currentUrl)
      return `${parsed.pathname}${parsed.search}${parsed.hash}` === expected
    } catch (_error) {
      return currentUrl === expected
    }
  }

  return currentUrl === expected
}

/**
 * @param {any} actual
 * @param {string | RegExp} expected
 */
function assertBrowserUrl(actual, expected) {
  assertBrowserPage(actual)
  const currentUrl = getBrowserPageUrl(actual)

  if (!browserUrlMatches(currentUrl, expected)) {
    failWithBrowserDiagnostics(
      `Expected browser URL to match ${describeExpected(expected)}, received ${describeExpected(currentUrl)}.`,
      actual
    )
  }
}

/**
 * @param {any} actual
 * @param {string | RegExp} expected
 */
function assertBrowserPath(actual, expected) {
  assertBrowserPage(actual)
  const currentUrl = getBrowserPageUrl(actual)
  let currentPath = currentUrl

  try {
    const parsed = new URL(currentUrl)
    currentPath = `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch (_error) {}

  const matches = expected instanceof RegExp ? expected.test(currentPath) : currentPath === expected

  if (!matches) {
    failWithBrowserDiagnostics(
      `Expected browser path to match ${describeExpected(expected)}, received ${describeExpected(currentPath)}.`,
      actual
    )
  }
}

/**
 * @param {any} actual
 * @param {string | RegExp} expected
 */
async function assertBrowserTitle(actual, expected) {
  assertBrowserPage(actual)
  const rawPage = actual.raw
  const title = typeof rawPage?.title === 'function' ? await rawPage.title() : ''
  const matches = expected instanceof RegExp ? expected.test(title) : title === expected

  if (!matches) {
    failWithBrowserDiagnostics(
      `Expected browser title to match ${describeExpected(expected)}, received ${describeExpected(title)}.`,
      actual
    )
  }
}

/**
 * @param {any[]} entries
 * @returns {string}
 */
function summarizeBrowserEntries(entries) {
  return entries.map((entry) => formatUnknown(entry?.text || entry?.message || entry)).join(', ')
}

/**
 * @param {any} actual
 */
function assertNoBrowserJavascriptErrors(actual) {
  assertBrowserPage(actual)
  const state = getBrowserPageState(actual)
  const errors = state?.javascriptErrors || []

  if (errors.length > 0) {
    failWithBrowserDiagnostics(
      `Expected browser page to have no JavaScript errors, received ${summarizeBrowserEntries(errors)}.`,
      actual
    )
  }
}

/**
 * @param {any} actual
 */
function assertNoBrowserConsoleLogs(actual) {
  assertBrowserPage(actual)
  const state = getBrowserPageState(actual)
  const messages = state?.consoleMessages || []

  if (messages.length > 0) {
    failWithBrowserDiagnostics(
      `Expected browser page to have no console logs, received ${summarizeBrowserEntries(messages)}.`,
      actual
    )
  }
}

/**
 * @param {any} actual
 */
function assertNoBrowserConsoleErrors(actual) {
  assertBrowserPage(actual)
  const state = getBrowserPageState(actual)
  const messages = state?.consoleErrors || []

  if (messages.length > 0) {
    failWithBrowserDiagnostics(
      `Expected browser page to have no console errors, received ${summarizeBrowserEntries(messages)}.`,
      actual
    )
  }
}

/**
 * @param {any} entry
 * @returns {string}
 */
function formatBrowserSmokeFailure(entry) {
  const lines = [
    'Sounding smoke diagnostics:',
    `- route: ${entry.target}`,
  ]

  if (entry.project) {
    lines.push(`- project: ${entry.project}`)
  }

  if (entry.currentUrl) {
    lines.push(`- current URL: ${entry.currentUrl}`)
  }

  if (entry.javascriptErrors?.length) {
    lines.push(`- JavaScript errors: ${summarizeBrowserEntries(entry.javascriptErrors)}`)
  }

  if (entry.consoleErrors?.length) {
    lines.push(`- console errors: ${summarizeBrowserEntries(entry.consoleErrors)}`)
  }

  return lines.join('\n')
}

/**
 * @param {any} actual
 */
function assertNoBrowserSmoke(actual) {
  if (isSoundingBrowserPageCollection(actual)) {
    const entries = getBrowserPageCollectionEntries(actual)
    const failure = entries.find(browserPageCollectionEntryHasSmoke)

    if (failure) {
      failWithBrowserDiagnostics(
        `Expected browser smoke check to pass for ${describeExpected(String(failure.target))}.\n\n${formatBrowserSmokeFailure(failure)}`,
        failure.page
      )
    }

    return
  }

  assertNoBrowserJavascriptErrors(actual)
  assertNoBrowserConsoleErrors(actual)
}

/**
 * @param {any} actual
 * @param {string} name
 * @param {Record<string, any>} [options]
 */
async function assertBrowserScreenshotMatch(actual, name, options = {}) {
  assertBrowserPage(actual)

  const state = getBrowserPageState(actual)

  try {
    await matchVisualSnapshot(actual, name, {
      project: state?.project,
      screenshotOptions: options,
    })
  } catch (error) {
    if (String(error?.code || '').startsWith('E_SOUNDING_VISUAL_SNAPSHOT_')) {
      failWithBrowserDiagnostics(error.message, actual)
      return
    }

    throw error
  }
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
      if (actual?.status !== expected) {
        failWithResponseDiagnostics(
          `Expected response status ${expected}, received ${describeExpected(actual?.status)}.`,
          actual
        )
      }
    },

    toHaveHeader(name, expected) {
      const header = getHeader(actual, name)
      if (header === null || header === undefined) {
        failWithResponseDiagnostics(`Expected response header \`${name}\` to be present.`, actual)
      }

      if (expected !== undefined && header !== expected) {
        failWithResponseDiagnostics(
          `Expected response header \`${name}\` to equal ${describeExpected(expected)}, received ${describeExpected(header)}.`,
          actual
        )
      }
    },

    toRedirectTo(expected) {
      const location = getHeader(actual, 'location')
      if (location !== expected) {
        failWithResponseDiagnostics(
          `Expected response to redirect to ${describeExpected(expected)}, received ${describeExpected(location)}.`,
          actual
        )
      }
    },

    toHaveJsonPath(path, expected) {
      const value = getPath(resolveStructuredValue(actual), path)
      assertDeepEqualWithResponseDiagnostics(
        value,
        expected,
        `Expected JSON path ${formatExpectation(path, expected)}, received ${describeExpected(value)}.`,
        actual
      )
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
      if (value?.component !== component) {
        failWithResponseDiagnostics(
          `Expected Inertia component ${describeExpected(component)}, received ${describeExpected(value?.component)}.`,
          actual
        )
      }
    },

    toHaveInertiaProp(path, expected) {
      assertInertiaPath(resolveInertiaProps(actual), path, expected, 'Inertia prop', actual)
    },

    toHaveInertiaProps(expected) {
      assertInertiaPathMap(
        resolveInertiaProps(actual),
        expected,
        'toHaveInertiaProps',
        'Inertia prop',
        actual
      )
    },

    toHaveInertiaPropCount(path, expected) {
      assertInertiaPropCount(actual, path, expected)
    },

    toHaveOnlyInertiaProps(expected) {
      assertOnlyInertiaProps(actual, expected)
    },

    toMatchInertiaProp(path, expected) {
      const value = getPath(resolveInertiaProps(actual), path)

      if (expected instanceof RegExp) {
        if (!expected.test(String(value))) {
          failWithResponseDiagnostics(
            `Expected Inertia prop ${formatExpectation(path, expected)}, received ${describeExpected(value)}.`,
            actual
          )
        }
        return
      }

      if (!String(value).includes(String(expected))) {
        failWithResponseDiagnostics(
          `Expected Inertia prop \`${path}\` to include ${describeExpected(expected)}, received ${describeExpected(value)}.`,
          actual
        )
      }
    },

    toHaveSharedInertiaProp(path, expected) {
      assertInertiaPath(
        resolveSharedInertiaProps(actual),
        path,
        expected,
        'shared Inertia prop',
        actual
      )
    },

    toHaveSharedInertiaProps(expected) {
      assertInertiaPathMap(
        resolveSharedInertiaProps(actual),
        expected,
        'toHaveSharedInertiaProps',
        'shared Inertia prop',
        actual
      )
    },

    toHaveInertiaError(path, expected) {
      assertInertiaPath(
        resolveInertiaErrors(actual),
        path,
        expected,
        'Inertia validation error',
        actual
      )
    },

    toHaveInertiaErrors(expected) {
      assertInertiaErrors(actual, expected)
    },

    toHaveNoInertiaErrors() {
      assertNoInertiaErrors(actual)
    },

    toHaveInertiaPartialReload(expected) {
      assertInertiaPartialReload(actual, expected)
    },

    async toSee(expected) {
      await assertBrowserText(actual, expected)
    },

    toHaveUrl(expected) {
      assertBrowserUrl(actual, expected)
    },

    toHavePath(expected) {
      assertBrowserPath(actual, expected)
    },

    async toHaveTitle(expected) {
      await assertBrowserTitle(actual, expected)
    },

    toHaveNoJavascriptErrors() {
      assertNoBrowserJavascriptErrors(actual)
    },

    toHaveNoConsoleLogs() {
      assertNoBrowserConsoleLogs(actual)
    },

    toHaveNoConsoleErrors() {
      assertNoBrowserConsoleErrors(actual)
    },

    toHaveNoSmoke() {
      assertNoBrowserSmoke(actual)
    },

    async toMatchScreenshot(name, options) {
      await assertBrowserScreenshotMatch(actual, name, options)
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

      toHaveInertiaProp(path, expected) {
        assertInertiaPathAbsent(resolveInertiaProps(actual), path, expected, 'Inertia prop', actual)
      },

      toHaveSharedInertiaProp(path, expected) {
        assertInertiaPathAbsent(
          resolveSharedInertiaProps(actual),
          path,
          expected,
          'shared Inertia prop',
          actual
        )
      },

      toHaveInertiaError(path, expected) {
        assertInertiaPathAbsent(
          resolveInertiaErrors(actual),
          path,
          expected,
          'Inertia validation error',
          actual
        )
      },

      async toSee(expected) {
        await assertBrowserText(actual, expected, true)
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
