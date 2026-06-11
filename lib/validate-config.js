const { createSoundingError } = require('./create-error')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingConfig} SoundingConfig */

const TOP_LEVEL_KEYS = [
  'environments',
  'app',
  'world',
  'datastore',
  'browser',
  'mail',
  'request',
  'sockets',
  'auth',
]

const SECTION_KEYS = {
  app: ['path', 'environment', 'quiet', 'loadOptions', 'liftOptions'],
  world: ['factories', 'scenarios'],
  datastore: ['mode', 'identity', 'adapter', 'root', 'isolation'],
  browser: ['enabled', 'type', 'projects', 'defaultProject', 'baseUrl', 'launchOptions'],
  mail: ['capture', 'layout', 'deliver', 'mode'],
  request: ['transport', 'baseUrl'],
  sockets: [
    'enabled',
    'timeout',
    'transports',
    'path',
    'baseUrl',
    'headers',
    'initialConnectionHeaders',
  ],
  auth: ['defaultActor', 'modelIdentity', 'sessionKey', 'worldCollection', 'password'],
}

const PASSWORD_KEYS = ['loginPath', 'pagePath', 'pageQuery', 'form', 'selectors']
const PASSWORD_FORM_KEYS = ['email', 'password', 'rememberMe', 'returnUrl']
const PASSWORD_SELECTOR_KEYS = ['email', 'password', 'rememberMe', 'submit']

const DATASTORE_MODES = ['managed', 'inherit', 'external']
const DATASTORE_ISOLATION = ['worker', 'run']
const REQUEST_TRANSPORTS = ['virtual', 'http']
const BROWSER_TYPES = ['chromium', 'firefox', 'webkit']
const MAIL_MODES = ['capture', 'passthrough']

/**
 * @param {any} value
 * @returns {value is AnyRecord}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {string} value
 * @param {string} candidate
 * @returns {number}
 */
function editDistance(value, candidate) {
  const rows = value.length + 1
  const columns = candidate.length + 1
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(0))

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row
  }

  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = value[row - 1] === candidate[column - 1] ? 0 : 1
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      )
    }
  }

  return matrix[value.length][candidate.length]
}

/**
 * @param {string} key
 * @param {string[]} allowed
 * @returns {string | null}
 */
function findSuggestion(key, allowed) {
  let best = null
  let bestDistance = Infinity

  for (const candidate of allowed) {
    const distance = editDistance(key.toLowerCase(), candidate.toLowerCase())

    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }

  return bestDistance <= 2 ? best : null
}

/**
 * @param {any} value
 * @returns {string}
 */
function describeValue(value) {
  if (Array.isArray(value)) {
    return 'array'
  }

  if (value === null) {
    return 'null'
  }

  return typeof value
}

/**
 * @param {string} path
 * @param {string} message
 * @param {{ value?: any, allowed?: string[], suggestion?: string }} [details]
 * @returns {never}
 */
function throwConfigError(path, message, details = {}) {
  const errorDetails = {
    path,
  }

  if (Object.prototype.hasOwnProperty.call(details, 'value')) {
    errorDetails.value = details.value
  }

  if (details.allowed !== undefined) {
    errorDetails.allowed = details.allowed
  }

  if (details.suggestion) {
    errorDetails.suggestion = details.suggestion
  }

  throw createSoundingError({
    code: 'E_SOUNDING_CONFIG_INVALID',
    name: 'SoundingConfigError',
    message: `Invalid Sounding config at \`${path}\`: ${message}`,
    details: errorDetails,
  })
}

/**
 * @param {AnyRecord} legacy
 * @returns {string}
 */
function buildLegacyManagedDatastoreSuggestion(legacy) {
  const nextEntries = [`mode: 'managed'`]
  const root = legacy.root ?? legacy.directory

  if (legacy.adapter !== undefined) {
    nextEntries.push(`adapter: ${JSON.stringify(legacy.adapter)}`)
  }

  if (root !== undefined) {
    nextEntries.push(`root: ${JSON.stringify(root)}`)
  }

  if (legacy.isolation !== undefined) {
    nextEntries.push(`isolation: ${JSON.stringify(legacy.isolation)}`)
  }

  return `Use \`datastore: { ${nextEntries.join(', ')} }\` instead.`
}

/**
 * @param {AnyRecord} datastore
 */
function assertNoLegacyDatastoreConfig(datastore) {
  if (Object.prototype.hasOwnProperty.call(datastore, 'managed')) {
    const legacy = isPlainObject(datastore.managed) ? datastore.managed : {}

    throwConfigError(
      'sounding.datastore.managed',
      'legacy managed datastore config is no longer supported.',
      {
        value: datastore.managed,
        suggestion: buildLegacyManagedDatastoreSuggestion(legacy),
      }
    )
  }

  if (Object.prototype.hasOwnProperty.call(datastore, 'directory')) {
    throwConfigError(
      'sounding.datastore.directory',
      'legacy datastore directory config is no longer supported.',
      {
        value: datastore.directory,
        suggestion: 'Use `sounding.datastore.root` instead.',
      }
    )
  }
}

/**
 * @param {AnyRecord} object
 * @param {string} path
 * @param {string[]} allowed
 */
function assertKnownKeys(object, path, allowed) {
  for (const key of Object.keys(object)) {
    if (allowed.includes(key)) {
      continue
    }

    const suggestion = findSuggestion(key, allowed)
    throwConfigError(
      `${path}.${key}`,
      suggestion
        ? `unknown option. Did you mean \`${path}.${suggestion}\`?`
        : `unknown option. Allowed options are ${allowed.map((entry) => `\`${entry}\``).join(', ')}.`,
      {
        value: object[key],
        allowed,
        suggestion: suggestion ? `Did you mean \`${path}.${suggestion}\`?` : undefined,
      }
    )
  }
}

/**
 * @param {AnyRecord} config
 * @param {string} path
 */
function assertSection(config, path) {
  if (!isPlainObject(config)) {
    throwConfigError(path, `must be an object, received ${describeValue(config)}.`, {
      value: config,
    })
  }
}

/**
 * @param {any} value
 * @param {string} path
 */
function assertString(value, path) {
  if (typeof value !== 'string') {
    throwConfigError(path, `must be a string, received ${describeValue(value)}.`, {
      value,
    })
  }
}

/**
 * @param {any} value
 * @param {string} path
 */
function assertNullableString(value, path) {
  if (value !== null && typeof value !== 'string') {
    throwConfigError(path, `must be a string or null, received ${describeValue(value)}.`, {
      value,
    })
  }
}

/**
 * @param {any} value
 * @param {string} path
 */
function assertBoolean(value, path) {
  if (typeof value !== 'boolean') {
    throwConfigError(path, `must be a boolean, received ${describeValue(value)}.`, {
      value,
    })
  }
}

/**
 * @param {any} value
 * @param {string} path
 * @param {string[]} allowed
 * @param {string} [suggestion]
 */
function assertOneOf(value, path, allowed, suggestion) {
  if (!allowed.includes(value)) {
    throwConfigError(path, `must be one of ${allowed.map((entry) => `\`${entry}\``).join(', ')}.`, {
      value,
      allowed,
      suggestion,
    })
  }
}

/**
 * @param {any} value
 * @param {string} path
 */
function assertPlainObject(value, path) {
  if (!isPlainObject(value)) {
    throwConfigError(path, `must be an object, received ${describeValue(value)}.`, {
      value,
    })
  }
}

/**
 * @param {any} value
 * @param {string} path
 */
function assertStringArray(value, path) {
  if (!Array.isArray(value)) {
    throwConfigError(path, `must be an array of strings, received ${describeValue(value)}.`, {
      value,
    })
  }

  value.forEach((entry, index) => {
    assertString(entry, `${path}[${index}]`)
  })
}

/**
 * @param {any} value
 * @param {string} path
 */
function assertPositiveNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throwConfigError(path, `must be a positive number, received ${describeValue(value)}.`, {
      value,
    })
  }
}

/**
 * @param {SoundingConfig} config
 * @returns {SoundingConfig}
 */
function validateConfig(config) {
  assertSection(config, 'sounding')
  assertKnownKeys(config, 'sounding', TOP_LEVEL_KEYS)

  assertStringArray(config.environments, 'sounding.environments')

  assertSection(config.app, 'sounding.app')
  assertKnownKeys(config.app, 'sounding.app', SECTION_KEYS.app)
  assertString(config.app.path, 'sounding.app.path')
  assertString(config.app.environment, 'sounding.app.environment')
  assertBoolean(config.app.quiet, 'sounding.app.quiet')
  assertPlainObject(config.app.liftOptions, 'sounding.app.liftOptions')

  if (config.app.loadOptions !== undefined) {
    assertPlainObject(config.app.loadOptions, 'sounding.app.loadOptions')
  }

  assertSection(config.world, 'sounding.world')
  assertKnownKeys(config.world, 'sounding.world', SECTION_KEYS.world)
  assertString(config.world.factories, 'sounding.world.factories')
  assertString(config.world.scenarios, 'sounding.world.scenarios')

  assertSection(config.datastore, 'sounding.datastore')
  assertNoLegacyDatastoreConfig(config.datastore)
  assertKnownKeys(config.datastore, 'sounding.datastore', SECTION_KEYS.datastore)
  assertOneOf(config.datastore.mode, 'sounding.datastore.mode', DATASTORE_MODES)
  assertString(config.datastore.identity, 'sounding.datastore.identity')

  if (config.datastore.mode === 'managed') {
    assertOneOf(config.datastore.adapter, 'sounding.datastore.adapter', ['sails-sqlite'])
    assertString(config.datastore.root, 'sounding.datastore.root')
    assertOneOf(config.datastore.isolation, 'sounding.datastore.isolation', DATASTORE_ISOLATION)
  }

  assertSection(config.browser, 'sounding.browser')
  assertKnownKeys(config.browser, 'sounding.browser', SECTION_KEYS.browser)
  assertBoolean(config.browser.enabled, 'sounding.browser.enabled')
  assertOneOf(config.browser.type, 'sounding.browser.type', BROWSER_TYPES)
  assertStringArray(config.browser.projects, 'sounding.browser.projects')
  assertString(config.browser.defaultProject, 'sounding.browser.defaultProject')

  if (config.browser.baseUrl !== undefined) {
    assertString(config.browser.baseUrl, 'sounding.browser.baseUrl')
  }

  assertPlainObject(config.browser.launchOptions, 'sounding.browser.launchOptions')

  assertSection(config.mail, 'sounding.mail')
  assertKnownKeys(config.mail, 'sounding.mail', SECTION_KEYS.mail)
  assertBoolean(config.mail.capture, 'sounding.mail.capture')

  if (config.mail.layout !== false) {
    assertString(config.mail.layout, 'sounding.mail.layout')
  }

  if (config.mail.deliver !== undefined) {
    assertBoolean(config.mail.deliver, 'sounding.mail.deliver')
  }

  if (config.mail.mode !== undefined) {
    assertOneOf(config.mail.mode, 'sounding.mail.mode', MAIL_MODES)
  }

  assertSection(config.request, 'sounding.request')
  assertKnownKeys(config.request, 'sounding.request', SECTION_KEYS.request)
  assertOneOf(
    config.request.transport,
    'sounding.request.transport',
    REQUEST_TRANSPORTS,
    'Use `virtual` for Sails-native in-process requests or `http` for real HTTP requests.'
  )

  if (config.request.baseUrl !== undefined) {
    assertString(config.request.baseUrl, 'sounding.request.baseUrl')
  }

  assertSection(config.sockets, 'sounding.sockets')
  assertKnownKeys(config.sockets, 'sounding.sockets', SECTION_KEYS.sockets)
  assertBoolean(config.sockets.enabled, 'sounding.sockets.enabled')
  assertPositiveNumber(config.sockets.timeout, 'sounding.sockets.timeout')
  assertStringArray(config.sockets.transports, 'sounding.sockets.transports')
  assertString(config.sockets.path, 'sounding.sockets.path')
  assertPlainObject(config.sockets.headers, 'sounding.sockets.headers')
  assertPlainObject(
    config.sockets.initialConnectionHeaders,
    'sounding.sockets.initialConnectionHeaders'
  )

  if (config.sockets.baseUrl !== undefined) {
    assertString(config.sockets.baseUrl, 'sounding.sockets.baseUrl')
  }

  assertSection(config.auth, 'sounding.auth')
  assertKnownKeys(config.auth, 'sounding.auth', SECTION_KEYS.auth)
  assertString(config.auth.defaultActor, 'sounding.auth.defaultActor')
  assertNullableString(config.auth.modelIdentity, 'sounding.auth.modelIdentity')
  assertNullableString(config.auth.sessionKey, 'sounding.auth.sessionKey')
  assertNullableString(config.auth.worldCollection, 'sounding.auth.worldCollection')
  assertSection(config.auth.password, 'sounding.auth.password')
  assertKnownKeys(config.auth.password, 'sounding.auth.password', PASSWORD_KEYS)
  assertString(config.auth.password.loginPath, 'sounding.auth.password.loginPath')
  assertString(config.auth.password.pagePath, 'sounding.auth.password.pagePath')
  assertPlainObject(config.auth.password.pageQuery, 'sounding.auth.password.pageQuery')
  assertSection(config.auth.password.form, 'sounding.auth.password.form')
  assertKnownKeys(config.auth.password.form, 'sounding.auth.password.form', PASSWORD_FORM_KEYS)
  assertString(config.auth.password.form.email, 'sounding.auth.password.form.email')
  assertString(config.auth.password.form.password, 'sounding.auth.password.form.password')
  assertString(config.auth.password.form.rememberMe, 'sounding.auth.password.form.rememberMe')
  assertString(config.auth.password.form.returnUrl, 'sounding.auth.password.form.returnUrl')
  assertPlainObject(config.auth.password.selectors, 'sounding.auth.password.selectors')
  assertKnownKeys(
    config.auth.password.selectors,
    'sounding.auth.password.selectors',
    PASSWORD_SELECTOR_KEYS
  )

  for (const [key, value] of Object.entries(config.auth.password.selectors)) {
    assertString(value, `sounding.auth.password.selectors.${key}`)
  }

  return config
}

module.exports = {
  validateConfig,
}
