const { createSoundingError } = require('./create-error')

/** @typedef {import('./types').SoundingTestOptions} SoundingTestOptions */
/** @typedef {import('./types').SoundingTrialHandler} SoundingTrialHandler */

const ALLOWED_TRANSPORTS = ['virtual', 'http']

/**
 * @param {any} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {string} apiName
 * @returns {string}
 */
function formatTrialSignature(apiName) {
  return `${apiName}(name, [options], handler)`
}

/**
 * @param {{
 *   code: string,
 *   message: string,
 *   apiName: string,
 *   value?: any,
 *   path?: string,
 *   allowed?: string[],
 *   suggestion?: string,
 * }} input
 * @returns {Error}
 */
function createTestArgumentError(input) {
  const { code, message, apiName, value, path, allowed, suggestion } = input
  /** @type {Record<string, any>} */
  const details = {
    api: apiName,
    signature: formatTrialSignature(apiName),
  }

  if (Object.prototype.hasOwnProperty.call(input, 'value')) {
    details.value = value
  }

  if (path) {
    details.path = path
  }

  if (allowed) {
    details.allowed = allowed
  }

  if (suggestion) {
    details.suggestion = suggestion
  }

  return createSoundingError({
    code,
    name: 'SoundingTestArgumentError',
    message,
    details,
  })
}

/**
 * @param {any} title
 * @param {string} apiName
 */
function assertTrialTitle(title, apiName) {
  if (typeof title === 'string' && title.trim()) {
    return
  }

  throw createTestArgumentError({
    code: 'E_SOUNDING_TEST_TITLE_REQUIRED',
    message: `Sounding ${apiName} requires a non-empty trial name. Use \`${formatTrialSignature(apiName)}\`.`,
    apiName,
    value: title,
    path: 'name',
  })
}

/**
 * @param {any} handler
 * @param {string} apiName
 */
function assertTrialHandler(handler, apiName) {
  if (typeof handler === 'function') {
    return
  }

  throw createTestArgumentError({
    code: 'E_SOUNDING_TEST_HANDLER_REQUIRED',
    message: `Sounding ${apiName} requires a trial handler. Use \`${formatTrialSignature(apiName)}\`.`,
    apiName,
    value: handler,
    path: 'handler',
    suggestion: `Pass an async function as the final argument: \`${formatTrialSignature(apiName)}\`.`,
  })
}

/**
 * @param {any} options
 * @param {string} apiName
 */
function assertBrowserOptions(options, apiName) {
  if (
    options.browser !== undefined &&
    typeof options.browser !== 'boolean' &&
    !isPlainObject(options.browser)
  ) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser\` must be a boolean or browser options object.`,
      apiName,
      value: options.browser,
      path: 'options.browser',
      suggestion: 'Use `browser: true` or `browser: { project: "desktop" }`.',
    })
  }

  if (!isPlainObject(options.browser)) {
    return
  }

  if (options.browser.type !== undefined && typeof options.browser.type !== 'string') {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser.type\` must be a string.`,
      apiName,
      value: options.browser.type,
      path: 'options.browser.type',
    })
  }

  if (options.browser.project !== undefined && typeof options.browser.project !== 'string') {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser.project\` must be a string.`,
      apiName,
      value: options.browser.project,
      path: 'options.browser.project',
    })
  }

  if (options.browser.launchOptions !== undefined && !isPlainObject(options.browser.launchOptions)) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser.launchOptions\` must be an object.`,
      apiName,
      value: options.browser.launchOptions,
      path: 'options.browser.launchOptions',
    })
  }

  if (options.browser.contextOptions !== undefined && !isPlainObject(options.browser.contextOptions)) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser.contextOptions\` must be an object.`,
      apiName,
      value: options.browser.contextOptions,
      path: 'options.browser.contextOptions',
    })
  }
}

/**
 * @param {any} options
 * @param {string} apiName
 */
function assertSocketOptions(options, apiName) {
  if (
    options.socket !== undefined &&
    typeof options.socket !== 'boolean' &&
    !isPlainObject(options.socket)
  ) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`socket\` must be a boolean or socket options object.`,
      apiName,
      value: options.socket,
      path: 'options.socket',
      suggestion: 'Use `socket: true` for trials that need Sails websocket helpers.',
    })
  }

  if (!isPlainObject(options.socket)) {
    return
  }

  if (options.socket.timeout !== undefined && typeof options.socket.timeout !== 'number') {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`socket.timeout\` must be a number.`,
      apiName,
      value: options.socket.timeout,
      path: 'options.socket.timeout',
    })
  }

  if (options.socket.baseUrl !== undefined && typeof options.socket.baseUrl !== 'string') {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`socket.baseUrl\` must be a string.`,
      apiName,
      value: options.socket.baseUrl,
      path: 'options.socket.baseUrl',
    })
  }
}

/**
 * @param {any} options
 * @param {string} apiName
 */
function assertTrialOptions(options, apiName) {
  if (!isPlainObject(options)) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} options must be an object when provided. Use \`${formatTrialSignature(apiName)}\`.`,
      apiName,
      value: options,
      path: 'options',
    })
  }

  if (options.transport !== undefined && !ALLOWED_TRANSPORTS.includes(options.transport)) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`transport\` must be either \`virtual\` or \`http\`.`,
      apiName,
      value: options.transport,
      path: 'options.transport',
      allowed: ALLOWED_TRANSPORTS,
      suggestion: 'Use `virtual` for Sails-native in-process requests or `http` for real HTTP requests.',
    })
  }

  assertBrowserOptions(options, apiName)
  assertSocketOptions(options, apiName)
}

/**
 * @param {any} title
 * @param {SoundingTestOptions | SoundingTrialHandler} optionsOrHandler
 * @param {SoundingTrialHandler} [maybeHandler]
 * @param {string} [apiName]
 * @returns {{ title: string, options: SoundingTestOptions, handler: SoundingTrialHandler }}
 */
function normalizeTestArgs(title, optionsOrHandler, maybeHandler, apiName = 'test') {
  assertTrialTitle(title, apiName)

  if (typeof optionsOrHandler === 'function') {
    assertTrialHandler(optionsOrHandler, apiName)

    return {
      title,
      options: {},
      handler: optionsOrHandler,
    }
  }

  const options = optionsOrHandler === undefined ? {} : optionsOrHandler
  assertTrialOptions(options, apiName)
  assertTrialHandler(maybeHandler, apiName)

  return {
    title,
    options,
    handler: maybeHandler,
  }
}

/**
 * @param {SoundingTestOptions} [options]
 * @param {string} [apiName]
 * @returns {{ nodeOptions: Record<string, any>, trialOptions: SoundingTestOptions }}
 */
function splitTestOptions(options = {}, apiName = 'test') {
  assertTrialOptions(options, apiName)

  const { transport, browser, socket, ...nodeOptions } = options

  return {
    nodeOptions: {
      concurrency: false,
      ...nodeOptions,
    },
    trialOptions: {
      transport,
      browser,
      socket,
    },
  }
}

module.exports = {
  normalizeTestArgs,
  splitTestOptions,
}
