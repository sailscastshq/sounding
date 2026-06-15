const { createSoundingError } = require('./create-error')

/** @typedef {import('./types').SoundingTestOptions} SoundingTestOptions */
/** @typedef {import('./types').SoundingTrialHandler} SoundingTrialHandler */

const ALLOWED_TRANSPORTS = ['virtual', 'http']
const ALLOWED_BROWSER_ARTIFACT_KEYS = ['outputDir', 'screenshot', 'trace', 'video', 'currentUrl']
const ALLOWED_BROWSER_ARTIFACT_MODES = ['off', 'on', 'on-failure']

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

  if (
    options.browser.artifacts !== undefined &&
    typeof options.browser.artifacts !== 'boolean' &&
    !isPlainObject(options.browser.artifacts)
  ) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser.artifacts\` must be a boolean or artifacts options object.`,
      apiName,
      value: options.browser.artifacts,
      path: 'options.browser.artifacts',
      suggestion: 'Use `browser: { artifacts: { trace: true } }` for richer failure artifacts.',
    })
  }

  if (!isPlainObject(options.browser.artifacts)) {
    return
  }

  for (const key of Object.keys(options.browser.artifacts)) {
    if (ALLOWED_BROWSER_ARTIFACT_KEYS.includes(key)) {
      continue
    }

    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser.artifacts.${key}\` is unknown.`,
      apiName,
      value: options.browser.artifacts[key],
      path: `options.browser.artifacts.${key}`,
      allowed: ALLOWED_BROWSER_ARTIFACT_KEYS,
      suggestion:
        'Use `outputDir`, `screenshot`, `trace`, `video`, or `currentUrl` inside `browser.artifacts`.',
    })
  }

  if (
    options.browser.artifacts.outputDir !== undefined &&
    typeof options.browser.artifacts.outputDir !== 'string'
  ) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser.artifacts.outputDir\` must be a string.`,
      apiName,
      value: options.browser.artifacts.outputDir,
      path: 'options.browser.artifacts.outputDir',
    })
  }

  for (const key of ['screenshot', 'trace', 'video']) {
    const value = options.browser.artifacts[key]

    if (
      value !== undefined &&
      typeof value !== 'boolean' &&
      !ALLOWED_BROWSER_ARTIFACT_MODES.includes(value)
    ) {
      throw createTestArgumentError({
        code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
        message: `Sounding ${apiName} option \`browser.artifacts.${key}\` must be a boolean or one of \`off\`, \`on\`, \`on-failure\`.`,
        apiName,
        value,
        path: `options.browser.artifacts.${key}`,
        allowed: ALLOWED_BROWSER_ARTIFACT_MODES,
      })
    }
  }

  if (
    options.browser.artifacts.currentUrl !== undefined &&
    typeof options.browser.artifacts.currentUrl !== 'boolean'
  ) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`browser.artifacts.currentUrl\` must be a boolean.`,
      apiName,
      value: options.browser.artifacts.currentUrl,
      path: 'options.browser.artifacts.currentUrl',
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
function assertWorldOptions(options, apiName) {
  if (options.world === undefined) {
    return
  }

  if (typeof options.world === 'string') {
    if (options.world.trim()) {
      return
    }

    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`world\` must name a world scenario.`,
      apiName,
      value: options.world,
      path: 'options.world',
      suggestion: 'Use `world: "signed-in-user"` to auto-load a named scenario.',
    })
  }

  if (!isPlainObject(options.world)) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`world\` must be a scenario name or world options object.`,
      apiName,
      value: options.world,
      path: 'options.world',
      suggestion: 'Use `world: "signed-in-user"` or `world: { name: "signed-in-user" }`.',
    })
  }

  if (typeof options.world.name !== 'string' || !options.world.name.trim()) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`world.name\` must be a non-empty scenario name.`,
      apiName,
      value: options.world.name,
      path: 'options.world.name',
      suggestion: 'Use `world: { name: "signed-in-user" }`.',
    })
  }

  if (options.world.context !== undefined && !isPlainObject(options.world.context)) {
    throw createTestArgumentError({
      code: 'E_SOUNDING_TEST_OPTIONS_INVALID',
      message: `Sounding ${apiName} option \`world.context\` must be an object when provided.`,
      apiName,
      value: options.world.context,
      path: 'options.world.context',
      suggestion: 'Use `world: { name: "signed-in-user", context: { ... } }`.',
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
  assertWorldOptions(options, apiName)
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

  const { transport, browser, socket, world, ...nodeOptions } = options

  return {
    nodeOptions: {
      concurrency: false,
      ...nodeOptions,
    },
    trialOptions: {
      transport,
      browser,
      socket,
      world,
    },
  }
}

module.exports = {
  normalizeTestArgs,
  splitTestOptions,
}
