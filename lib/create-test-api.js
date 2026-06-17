const nodeTest = require('node:test')
const { createAppManager } = require('./create-app-manager')
const { createExpect } = require('./create-expect')
const { createRuntime } = require('./create-runtime')
const { createSoundingError } = require('./create-error')
const { runWithTrialContext } = require('./trial-context')
const { normalizeTestArgs, splitTestOptions } = require('./validate-test-args')

/** @typedef {import('./types').SoundingRuntime} SoundingRuntime */
/** @typedef {import('./types').SoundingExpect} SoundingExpect */
/** @typedef {import('./types').SoundingBrowserArtifacts} SoundingBrowserArtifacts */
/** @typedef {import('./types').SoundingBrowserSession} SoundingBrowserSession */
/** @typedef {import('./types').SoundingTest} SoundingTest */
/** @typedef {import('./types').SoundingTestOptions} SoundingTestOptions */
/** @typedef {import('./types').SoundingTrialContext} SoundingTrialContext */
/** @typedef {import('./types').SoundingTrialHandler} SoundingTrialHandler */
/** @typedef {import('./types').SoundingTrialRegistrar} SoundingTrialRegistrar */
/** @typedef {Function & { skip?: Function, todo?: Function, only?: Function }} NodeTestLike */

let defaultAppManager = null
let defaultCleanupRegistered = false
let trialQueue = Promise.resolve()

function getDefaultAppManager() {
  defaultAppManager ||= createAppManager()
  return defaultAppManager
}

function ensureDefaultAppManagerCleanup() {
  if (defaultCleanupRegistered || typeof nodeTest.after !== 'function') {
    return
  }

  nodeTest.after(async () => {
    if (defaultAppManager) {
      await defaultAppManager.lower()
    }
  })

  defaultCleanupRegistered = true
}

/**
 * @param {{ requiresHttp?: boolean, browser?: boolean, socket?: boolean }} [options]
 * @returns {Promise<{ sounding: SoundingRuntime, teardown(): Promise<void> }>}
 */
async function resolveRuntimeFromGlobals(options = {}) {
  const runtime = globalThis.sounding || globalThis.sails?.sounding || globalThis.sails?.hooks?.sounding
  const requiresHttp = Boolean(options.requiresHttp || options.browser || options.socket)
  const httpServer = globalThis.sails?.hooks?.http?.server
  const hasHttpServer = Boolean(
    httpServer &&
      (httpServer.listening ||
        (typeof httpServer.address === 'function' && httpServer.address()))
  )

  if (runtime && (!requiresHttp || hasHttpServer)) {
    return {
      sounding: runtime,
      teardown: async () => runtime.lower(),
    }
  }

  const appManager = getDefaultAppManager()
  ensureDefaultAppManagerCleanup()
  const sounding = await appManager.runtime({ app: requiresHttp ? 'lift' : 'load' })
  return {
    sounding,
    teardown: async () => sounding.lower(),
  }
}

/**
 * @param {{ requiresHttp?: boolean, browser?: boolean, socket?: boolean }} [options]
 * @returns {Promise<{ sounding: SoundingRuntime, teardown(): Promise<void> }>}
 */
async function resolveIsolatedRuntimeFromGlobals(options = {}) {
  const requiresHttp = Boolean(options.requiresHttp || options.browser || options.socket)
  const httpServer = globalThis.sails?.hooks?.http?.server
  const hasHttpServer = Boolean(
    httpServer &&
      (httpServer.listening ||
        (typeof httpServer.address === 'function' && httpServer.address()))
  )
  let sails = null

  if (globalThis.sails && (!requiresHttp || hasHttpServer)) {
    sails = globalThis.sails
  } else {
    const appManager = getDefaultAppManager()
    ensureDefaultAppManagerCleanup()
    sails = requiresHttp ? await appManager.lift() : await appManager.load()
  }

  const sounding = createRuntime(sails)

  return {
    sounding,
    teardown: async () => sounding.lower(),
  }
}

/**
 * @param {SoundingRuntime | (() => SoundingRuntime | Promise<SoundingRuntime>) | undefined} runtime
 * @param {SoundingTestOptions} options
 * @returns {Promise<{ sounding: SoundingRuntime, teardown(): Promise<void>, isolated: boolean }>}
 */
async function resolveTrialRuntime(runtime, options = {}) {
  const requires = {
    requiresHttp: options.transport === 'http',
    browser: Boolean(options.browser),
    socket: Boolean(options.socket),
  }

  if (typeof runtime === 'function') {
    const sounding = await runtime()
    return {
      sounding,
      teardown: async () => sounding.lower(),
      isolated: Boolean(options.concurrent),
    }
  }

  if (runtime) {
    if (options.concurrent) {
      throw createSoundingError({
        code: 'E_SOUNDING_CONCURRENT_RUNTIME_SHARED',
        name: 'SoundingConcurrencyError',
        message:
          'Sounding concurrent trials need isolated runtime state. Pass a runtime factory to createTestApi({ runtime: () => createRuntime(sails) }) or use the default app manager.',
        details: {
          suggestion:
            'Use `concurrent: true` only when each trial receives its own Sounding runtime.',
        },
      })
    }

    return {
      sounding: runtime,
      teardown: async () => runtime.lower(),
      isolated: false,
    }
  }

  const resolved = options.concurrent
    ? await resolveIsolatedRuntimeFromGlobals(requires)
    : await resolveRuntimeFromGlobals(requires)

  return {
    ...resolved,
    isolated: Boolean(options.concurrent),
  }
}

/**
 * @param {Record<string, any>} sails
 * @param {SoundingRuntime} sounding
 * @param {{ isolated?: boolean }} [options]
 * @returns {Record<string, any>}
 */
function createTrialSails(sails, sounding, options = {}) {
  if (!options.isolated) {
    sails.sounding ||= sounding
    sails.hooks ||= {}
    sails.hooks.sounding ||= sounding
    sails.helpers ||= sounding.helpers
    return sails
  }

  const hooks = {
    ...(sails.hooks || {}),
    sounding,
  }

  return new Proxy(sails, {
    get(target, property, receiver) {
      if (property === 'sounding') {
        return sounding
      }

      if (property === 'hooks') {
        return hooks
      }

      if (property === 'helpers') {
        return target.helpers || sounding.helpers
      }

      return Reflect.get(target, property, receiver)
    },
    set(target, property, value, receiver) {
      if (property === 'sounding') {
        return true
      }

      if (property === 'hooks') {
        Object.assign(hooks, value || {})
        hooks.sounding = sounding
        return true
      }

      return Reflect.set(target, property, value, receiver)
    },
  })
}

/**
 * @param {import('./types').SoundingRequestClient} request
 * @param {'get' | 'head' | 'post' | 'put' | 'patch' | 'delete'} method
 * @returns {Function | undefined}
 */
function bindRequestMethod(request, method) {
  return typeof request?.[method] === 'function' ? request[method].bind(request) : undefined
}

/**
 * @param {SoundingTestOptions['world']} worldOption
 * @returns {{ name: string, context: Record<string, any> } | null}
 */
function normalizeWorldOption(worldOption) {
  if (worldOption === undefined) {
    return null
  }

  if (typeof worldOption === 'string') {
    return {
      name: worldOption.trim(),
      context: {},
    }
  }

  return {
    name: worldOption.name.trim(),
    context: worldOption.context || {},
  }
}

/**
 * @param {SoundingTestOptions['browser']} browserOption
 * @param {string | undefined} title
 * @returns {import('./types').SoundingBrowserOpenOptions}
 */
function normalizeBrowserOpenOptions(browserOption, title) {
  if (browserOption === true) {
    return {
      trialName: title,
    }
  }

  if (typeof browserOption === 'string') {
    return {
      project: browserOption.trim(),
      trialName: title,
    }
  }

  return {
    ...(browserOption || {}),
    trialName: title,
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatUnknownError(error) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * @param {SoundingBrowserArtifacts | null | undefined} artifacts
 * @returns {boolean}
 */
function hasBrowserArtifacts(artifacts) {
  return Boolean(
    artifacts &&
      (artifacts.currentUrl ||
        artifacts.currentUrlPath ||
        artifacts.screenshot ||
        artifacts.trace ||
        artifacts.video ||
        artifacts.errors?.length)
  )
}

/**
 * @param {SoundingBrowserArtifacts} artifacts
 * @returns {string}
 */
function formatBrowserArtifacts(artifacts) {
  const lines = ['Sounding browser artifacts:']

  if (artifacts.currentUrl) {
    lines.push(`- URL: ${artifacts.currentUrl}`)
  }

  if (artifacts.currentUrlPath) {
    lines.push(`- current URL file: ${artifacts.currentUrlPath}`)
  }

  if (artifacts.screenshot) {
    lines.push(`- screenshot: ${artifacts.screenshot}`)
  }

  if (artifacts.trace) {
    lines.push(`- trace: ${artifacts.trace}`)
  }

  if (artifacts.video) {
    lines.push(`- video: ${artifacts.video}`)
  }

  for (const captureError of artifacts.errors || []) {
    lines.push(`- ${captureError.artifact} capture failed: ${captureError.message}`)
  }

  return lines.join('\n')
}

/**
 * @param {SoundingBrowserSession | null} browserSession
 * @returns {Promise<SoundingBrowserArtifacts | null>}
 */
async function captureBrowserFailureArtifacts(browserSession) {
  if (typeof browserSession?.captureFailureArtifacts !== 'function') {
    return null
  }

  try {
    return await browserSession.captureFailureArtifacts()
  } catch (captureError) {
    return {
      outputDir: '',
      directory: '',
      project: browserSession.project,
      errors: [
        {
          artifact: 'browser',
          message: formatUnknownError(captureError),
        },
      ],
    }
  }
}

/**
 * @param {unknown} error
 * @param {{ world?: { name: string, context: Record<string, any> }, browserArtifacts?: SoundingBrowserArtifacts | null }} metadata
 * @returns {unknown}
 */
function decorateTrialError(error, metadata) {
  const browserArtifacts = hasBrowserArtifacts(metadata.browserArtifacts)
    ? metadata.browserArtifacts
    : null

  if ((!metadata.world && !browserArtifacts) || !error || typeof error !== 'object') {
    return error
  }

  const target = /** @type {Record<string, any>} */ (error)
  const existingSounding =
    target.sounding && typeof target.sounding === 'object' ? target.sounding : {}
  const existingDetails =
    target.details && typeof target.details === 'object' ? target.details : null

  target.sounding = {
    ...existingSounding,
    ...(metadata.world ? { world: metadata.world } : {}),
    ...(browserArtifacts ? { browserArtifacts } : {}),
  }

  if (existingDetails) {
    target.details = {
      ...existingDetails,
      ...(metadata.world
        ? {
            world: metadata.world.name,
            worldContext: metadata.world.context,
          }
        : {}),
      ...(browserArtifacts ? { browserArtifacts } : {}),
    }
  }

  if (browserArtifacts && typeof target.message === 'string') {
    target.message = `${target.message}\n\n${formatBrowserArtifacts(browserArtifacts)}`
  }

  return error
}

/**
 * @template T
 * @param {() => Promise<T>} handler
 * @returns {Promise<T>}
 */
async function runInTrialQueue(handler) {
  const previous = trialQueue
  let release = () => {}

  trialQueue = new Promise((resolve) => {
    release = resolve
  })

  await previous

  try {
    return await handler()
  } finally {
    release()
  }
}

/**
 * @param {{
 *   runtime?: SoundingRuntime | (() => SoundingRuntime | Promise<SoundingRuntime>),
 *   mode: string,
 *   title?: string,
 *   nodeContext: Record<string, any>,
 *   handler: SoundingTrialHandler,
 *   options?: SoundingTestOptions,
 * }} args
 * @returns {Promise<any>}
 */
async function runTrial({ runtime, mode, title, nodeContext, handler, options = {} }) {
  const resolved = await resolveTrialRuntime(runtime, options)
  const sounding = resolved.sounding

  return runWithTrialContext(
    {
      runtime: sounding,
      mailbox: sounding.mailbox,
      getConfig: () => sounding.config,
    },
    async () => {
      const booted = await sounding.boot({ mode })
      const sails = createTrialSails(booted.sails || {}, sounding, {
        isolated: resolved.isolated,
      })
      const worldOption = normalizeWorldOption(options.world)
      const trialMetadata = {
        ...(worldOption ? { world: worldOption } : {}),
      }
      let browserSession = null

      try {
        if (worldOption) {
          await sounding.world.use(worldOption.name, worldOption.context)
        }

        const request = options.transport ? sounding.request.using(options.transport) : sounding.request
        const visit = options.transport ? sounding.visit.using(options.transport) : sounding.visit
        const socketOptions =
          options.socket && typeof options.socket === 'object' ? options.socket : {}
        const sockets =
          options.socket && typeof options.socket === 'object'
            ? {
                connect(connectOptions = {}) {
                  return sounding.sockets.connect({
                    ...socketOptions,
                    ...connectOptions,
                  })
                },
                as(actor) {
                  return {
                    connect(connectOptions = {}) {
                      return sounding.sockets.as(actor).connect({
                        ...socketOptions,
                        ...connectOptions,
                      })
                    },
                  }
                },
                closeAll() {
                  return sounding.sockets.closeAll()
                },
              }
            : sounding.sockets

        if (options.browser) {
          browserSession = await sounding.browser.open(
            normalizeBrowserOpenOptions(options.browser, title)
          )
        }

        /** @type {SoundingExpect} */
        const expect = browserSession?.expect
          ? createExpect.withFallback(browserSession.expect)
          : /** @type {SoundingExpect} */ (createExpect)

        /** @type {SoundingTrialContext} */
        const context = {
          ...nodeContext,
          t: nodeContext,
          expect,
          sails,
          request,
          visit,
          sockets,
          auth: sounding.auth,
          login: sounding.auth?.login,
          world: sounding.world,
          mailbox: sounding.mailbox,
          browser: browserSession?.browser,
          browserContext: browserSession?.context,
          page: browserSession?.page,
          get: /** @type {any} */ (bindRequestMethod(request, 'get')),
          head: /** @type {any} */ (bindRequestMethod(request, 'head')),
          post: /** @type {any} */ (bindRequestMethod(request, 'post')),
          put: /** @type {any} */ (bindRequestMethod(request, 'put')),
          patch: /** @type {any} */ (bindRequestMethod(request, 'patch')),
          del: /** @type {any} */ (bindRequestMethod(request, 'delete')),
        }

        return await handler(context)
      } catch (error) {
        const browserArtifacts = await captureBrowserFailureArtifacts(browserSession)

        throw decorateTrialError(error, {
          ...trialMetadata,
          browserArtifacts,
        })
      } finally {
        await resolved.teardown()
      }
    }
  )
}

/**
 * @param {NodeTestLike} baseTest
 * @param {SoundingRuntime | (() => SoundingRuntime | Promise<SoundingRuntime>) | undefined} runtime
 * @param {string} mode
 * @param {boolean} [forceConcurrent]
 * @returns {SoundingTrialRegistrar}
 */
function createTrialMethod(baseTest, runtime, mode, apiName = 'test', forceConcurrent = false) {
  const registerTrial = function registerTrial(title, optionsOrHandler, maybeHandler) {
    const { options, handler } = normalizeTestArgs(
      title,
      optionsOrHandler,
      maybeHandler,
      apiName
    )
    const nextOptions = forceConcurrent ? { ...options, concurrent: true } : options
    const { nodeOptions, trialOptions } = splitTestOptions(nextOptions, apiName)

    return baseTest(title, nodeOptions, async (nodeContext) => {
      const run = trialOptions.concurrent ? (action) => action() : runInTrialQueue

      return run(async () => {
        return runTrial({
          runtime,
          mode,
          title,
          nodeContext,
          handler,
          options: trialOptions,
        })
      })
    })
  }

  return /** @type {SoundingTrialRegistrar} */ (registerTrial)
}

/**
 * Create Sounding's `test()` API.
 *
 * @param {{ baseTest?: NodeTestLike, runtime?: SoundingRuntime | (() => SoundingRuntime | Promise<SoundingRuntime>) }} [options]
 * @returns {SoundingTest}
 */
function createTestApi({ baseTest = nodeTest, runtime } = {}) {
  function soundingTest(title, optionsOrHandler, maybeHandler) {
    const { options, handler } = normalizeTestArgs(title, optionsOrHandler, maybeHandler, 'test')
    const { nodeOptions, trialOptions } = splitTestOptions(options, 'test')

    return baseTest(title, nodeOptions, async (nodeContext) => {
      const run = trialOptions.concurrent ? (action) => action() : runInTrialQueue

      return run(async () => {
        return runTrial({
          runtime,
          mode: 'trial',
          title,
          nodeContext,
          handler,
          options: trialOptions,
        })
      })
    })
  }

  soundingTest.skip = (...args) => baseTest.skip?.(...args)
  soundingTest.todo = (...args) => baseTest.todo?.(...args)
  if (typeof baseTest.only === 'function') {
    soundingTest.only = createTrialMethod(baseTest.only.bind(baseTest), runtime, 'trial', 'test.only')
  }
  soundingTest.concurrent = createTrialMethod(baseTest, runtime, 'trial', 'test.concurrent', true)

  return soundingTest
}

module.exports = {
  createTestApi,
  normalizeBrowserOpenOptions,
  normalizeTestArgs,
  resolveRuntimeFromGlobals,
  runInTrialQueue,
  runTrial,
  splitTestOptions,
}
