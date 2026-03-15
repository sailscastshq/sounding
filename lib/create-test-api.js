const nodeTest = require('node:test')
const { createAppManager } = require('./create-app-manager')
const { createExpect } = require('./create-expect')

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

function normalizeTestArgs(title, optionsOrHandler, maybeHandler) {
  if (typeof optionsOrHandler === 'function') {
    return {
      title,
      options: {},
      handler: optionsOrHandler,
    }
  }

  return {
    title,
    options: optionsOrHandler || {},
    handler: maybeHandler,
  }
}

async function resolveRuntimeFromGlobals(options = {}) {
  const runtime = globalThis.sounding || globalThis.sails?.sounding || globalThis.sails?.hooks?.sounding
  const requiresHttp = Boolean(options.http || options.browser)
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
  const sounding = await appManager.runtime({ http: requiresHttp })
  return {
    sounding,
    teardown: async () => sounding.lower(),
  }
}

function bindRequestMethod(request, method) {
  return typeof request?.[method] === 'function' ? request[method].bind(request) : undefined
}

function splitTestOptions(options = {}) {
  const {
    transport,
    browser,
    ...nodeOptions
  } = options

  return {
    nodeOptions: {
      concurrency: false,
      ...nodeOptions,
    },
    trialOptions: {
      transport,
      browser,
    },
  }
}

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

async function runTrial({ runtime, mode, nodeContext, handler, options = {} }) {
  const activeRuntime = typeof runtime === 'function' ? await runtime() : runtime
  const resolved = activeRuntime
    ? {
        sounding: activeRuntime,
        teardown: async () => activeRuntime.lower(),
      }
    : await resolveRuntimeFromGlobals({
        http: options.transport === 'http',
        browser: Boolean(options.browser),
      })
  const sounding = resolved.sounding
  const booted = await sounding.boot({ mode })
  const sails = booted.sails || {}

  sails.sounding ||= sounding
  sails.hooks ||= {}
  sails.hooks.sounding ||= sounding
  sails.helpers ||= sounding.helpers

  const request = options.transport ? sounding.request.using(options.transport) : sounding.request
  const visit = options.transport ? sounding.visit.using(options.transport) : sounding.visit

  let browserSession = null
  if (options.browser) {
    browserSession = await sounding.browser.open(options.browser === true ? {} : options.browser)
  }

  const expect = browserSession?.expect
    ? createExpect.withFallback(browserSession.expect)
    : createExpect

  const context = {
    ...nodeContext,
    t: nodeContext,
    expect,
    sails,
    request,
    visit,
    auth: sounding.auth,
    login: sounding.auth?.login,
    world: sounding.world,
    mailbox: sounding.mailbox,
    browser: browserSession?.browser,
    browserContext: browserSession?.context,
    page: browserSession?.page,
    get: bindRequestMethod(request, 'get'),
    head: bindRequestMethod(request, 'head'),
    post: bindRequestMethod(request, 'post'),
    put: bindRequestMethod(request, 'put'),
    patch: bindRequestMethod(request, 'patch'),
    del: bindRequestMethod(request, 'delete'),
  }

  try {
    return await handler(context)
  } finally {
    await resolved.teardown()
  }
}

function createTrialMethod(baseTest, runtime, mode) {
  return function registerTrial(title, optionsOrHandler, maybeHandler) {
    const { options, handler } = normalizeTestArgs(title, optionsOrHandler, maybeHandler)
    const { nodeOptions, trialOptions } = splitTestOptions(options)

    return baseTest(title, nodeOptions, async (nodeContext) => {
      return runInTrialQueue(async () => {
        return runTrial({
          runtime,
          mode,
          nodeContext,
          handler,
          options: trialOptions,
        })
      })
    })
  }
}

function createTestApi({ baseTest = nodeTest, runtime } = {}) {
  function soundingTest(title, optionsOrHandler, maybeHandler) {
    const { options, handler } = normalizeTestArgs(title, optionsOrHandler, maybeHandler)
    const { nodeOptions, trialOptions } = splitTestOptions(options)

    return baseTest(title, nodeOptions, async (nodeContext) => {
      return runInTrialQueue(async () => {
        return runTrial({
          runtime,
          mode: 'trial',
          nodeContext,
          handler,
          options: trialOptions,
        })
      })
    })
  }

  soundingTest.skip = (...args) => baseTest.skip(...args)
  soundingTest.todo = (...args) => baseTest.todo(...args)
  if (typeof baseTest.only === 'function') {
    soundingTest.only = (...args) => baseTest.only(...args)
  }

  // Temporary compatibility aliases while the public docs move fully to `test()`.
  soundingTest.helper = createTrialMethod(baseTest, runtime, 'helper')
  soundingTest.endpoint = createTrialMethod(baseTest, runtime, 'endpoint')

  return soundingTest
}

module.exports = {
  createTestApi,
  normalizeTestArgs,
  resolveRuntimeFromGlobals,
  runInTrialQueue,
  runTrial,
  splitTestOptions,
}
