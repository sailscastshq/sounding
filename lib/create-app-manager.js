const fs = require('node:fs')
const path = require('node:path')

const { getDefaultConfig } = require('./default-config')
const { mergeConfig } = require('./merge-config')
const { normalizeUserConfig } = require('./normalize-config')
const { buildManagedSqlitePath, resolveManagedRoot } = require('./resolve-datastore')
const { createSoundingError } = require('./create-error')
const { loadDependencyFromApp, resolveDependencyFromApp } = require('./resolve-dependency')
const { validateConfig } = require('./validate-config')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingAppManager} SoundingAppManager */
/** @typedef {import('./types').SoundingAppManagerOptions} SoundingAppManagerOptions */
/** @typedef {import('./types').SoundingConfig} SoundingConfig */
/** @typedef {import('./types').SoundingRuntime} SoundingRuntime */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {string} appPath
 * @returns {SoundingConfig}
 */
function loadAppSoundingConfig(appPath) {
  const configPath = path.join(appPath, 'config', 'sounding.js')

  if (!fs.existsSync(configPath)) {
    return validateConfig(getDefaultConfig())
  }

  delete require.cache[require.resolve(configPath)]
  const loaded = require(configPath)
  return validateConfig(
    /** @type {SoundingConfig} */ (
      mergeConfig(getDefaultConfig(), normalizeUserConfig(loaded?.sounding || {}))
    )
  )
}

/**
 * @param {string} appPath
 * @param {{ resolveImplementation?: (moduleId: string, options?: { paths?: string[] }) => string }} [options]
 * @returns {any}
 */
function defaultLoadSails(appPath, options = {}) {
  return loadDependencyFromApp({
    appPath,
    moduleId: 'sails',
    purpose: 'load your Sails app',
    install: 'npm install sails',
    resolveImplementation: options.resolveImplementation,
  })
}

/**
 * @param {SoundingConfig} config
 * @param {string} appPath
 * @param {{ resolveImplementation?: (moduleId: string, options?: { paths?: string[] }) => string }} [options]
 * @returns {void}
 */
function assertManagedDatastoreDependency(config, appPath, options = {}) {
  if (config.datastore?.mode !== 'managed') {
    return
  }

  const adapter = config.datastore.adapter || 'sails-sqlite'

  if (adapter !== 'sails-sqlite') {
    return
  }

  resolveDependencyFromApp({
    appPath,
    moduleId: adapter,
    purpose: 'run managed datastore trials',
    install: 'npm install -D sails-sqlite',
    suggestion:
      'Or set `sounding.datastore` to `inherit` or configure an external datastore if this app should reuse its own test database.',
    resolveImplementation: options.resolveImplementation,
  })
}

/**
 * @param {SoundingConfig} config
 * @param {string} appPath
 * @param {{ resolveImplementation?: (moduleId: string, options?: { paths?: string[] }) => string }} [options]
 * @returns {AnyRecord}
 */
function buildManagedDatastoreOverrides(config, appPath, options = {}) {
  if (config.datastore?.mode !== 'managed') {
    return {}
  }

  assertManagedDatastoreDependency(config, appPath, options)

  const identity = config.datastore.identity || 'default'

  return {
    datastores: {
      [identity]: {
        adapter: config.datastore.adapter || 'sails-sqlite',
        url: buildManagedSqlitePath({
          root: resolveManagedRoot({
            datastore: config.datastore,
            appPath,
          }),
          identity,
          isolation: config.datastore.isolation || 'worker',
        }),
      },
    },
    models: {
      migrate: 'drop',
    },
  }
}

/**
 * @param {Partial<SoundingConfig>} [config]
 * @returns {{ install(): void, uninstall(): void }}
 */
function createOutputFilter(config = {}) {
  if (config.app?.quiet === false) {
    return {
      install() {},
      uninstall() {},
    }
  }

  const noisyPatterns = [
    /start\s+build started/i,
    /ready\s+built in/i,
    /\[DEP0044\].*util\.isArray/i,
    /node --trace-deprecation/i,
    /^\s*info:\s/m,
    /success:\s*true.*no new issues to notify/i,
  ]

  let installed = false
  let originalStdoutWrite = null
  let originalStderrWrite = null

  function shouldSuppress(chunk) {
    const value = String(chunk || '')
    const normalizedValue = value.replace(/\u001b\[[0-9;]*m/g, '')
    return noisyPatterns.some((pattern) => pattern.test(normalizedValue))
  }

  function wrapWrite(write) {
    return function soundingWrite(chunk, encoding, callback) {
      if (shouldSuppress(chunk)) {
        if (typeof encoding === 'function') {
          encoding()
        }

        if (typeof callback === 'function') {
          callback()
        }

        return true
      }

      return write.call(this, chunk, encoding, callback)
    }
  }

  return {
    install() {
      if (installed) {
        return
      }

      originalStdoutWrite = process.stdout.write
      originalStderrWrite = process.stderr.write
      process.stdout.write = wrapWrite(originalStdoutWrite)
      process.stderr.write = wrapWrite(originalStderrWrite)
      installed = true
    },

    uninstall() {
      if (!installed) {
        return
      }

      process.stdout.write = originalStdoutWrite
      process.stderr.write = originalStderrWrite
      originalStdoutWrite = null
      originalStderrWrite = null
      installed = false
    },
  }
}

/**
 * @param {'load' | 'lift'} mode
 * @returns {import('./types').SoundingAppLifecycleState}
 */
function createLifecycleState(mode) {
  return {
    mode,
    status: 'idle',
    runs: 0,
    reuses: 0,
    reloads: 0,
    durationMs: null,
    startedAt: null,
    readyAt: null,
    error: null,
  }
}

/**
 * @returns {boolean}
 */
function shouldReportLifecycle() {
  return (
    process.env.SOUNDING_LIFECYCLE === 'verbose' ||
    process.env.SOUNDING_DIAGNOSTICS === 'verbose'
  )
}

/**
 * @param {string} message
 * @returns {void}
 */
function reportLifecycle(message) {
  if (!shouldReportLifecycle()) {
    return
  }

  process.stderr.write(`[sounding] ${message}\n`)
}

/**
 * @param {SoundingConfig} config
 * @param {string} appPath
 * @returns {string | null}
 */
function resolveManagedDatastoreFile(config, appPath) {
  if (config.datastore?.mode !== 'managed') {
    return null
  }

  const identity = config.datastore.identity || 'default'

  return buildManagedSqlitePath({
    root: resolveManagedRoot({
      datastore: config.datastore,
      appPath,
    }),
    identity,
    isolation: config.datastore.isolation || 'worker',
  })
}

/**
 * @param {SoundingAppManagerOptions} [options]
 * @returns {SoundingAppManager}
 */
function createAppManager({
  appPath = process.cwd(),
  environment = 'test',
  liftOptions = {},
  SailsConstructor,
  loadSails = defaultLoadSails,
} = {}) {
  let loadedApp = null
  let liftedApp = null
  let loadPromise = null
  let liftPromise = null
  const managedArtifacts = new Set()
  let outputFilter = null
  const lifecycle = {
    load: createLifecycleState('load'),
    lift: createLifecycleState('lift'),
  }

  function resolveAppPath() {
    return path.resolve(appPath)
  }

  function resolveConfig() {
    return loadAppSoundingConfig(resolveAppPath())
  }

  function resolveSailsConstructor() {
    if (SailsConstructor) {
      return SailsConstructor
    }

    return loadSails(resolveAppPath()).constructor
  }

  function buildOptions(mode) {
    const config = resolveConfig()
    outputFilter ||= createOutputFilter(config)
    const managedFile = resolveManagedDatastoreFile(config, resolveAppPath())

    if (managedFile) {
      managedArtifacts.add(managedFile)
    }

    /** @type {AnyRecord} */
    const appConfig = config.app || {}
    /** @type {AnyRecord} */
    const baseOptions = {
      appPath: resolveAppPath(),
      environment: appConfig.environment || environment,
      ...buildManagedDatastoreOverrides(config, resolveAppPath()),
    }
    const modeOptions =
      mode === 'load'
        ? mergeConfig(
            {
              hooks: {
                shipwright: false,
                content: false,
              },
            },
            appConfig.loadOptions || {}
          )
        : mergeConfig(appConfig.liftOptions || {}, liftOptions)
    /** @type {AnyRecord} */
    const nextOptions = mergeConfig(baseOptions, modeOptions)

    if (mode === 'load' && nextOptions.datastores?.content) {
      delete nextOptions.datastores.content
    }

    return nextOptions
  }

  async function cleanupManagedArtifacts() {
    for (const filePath of managedArtifacts) {
      const companionPaths = [
        filePath,
        `${filePath}-journal`,
        `${filePath}-wal`,
        `${filePath}-shm`,
      ]

      for (const artifactPath of companionPaths) {
        await fs.promises.rm(artifactPath, { force: true }).catch(() => {})
      }
    }
  }

  /**
   * @param {SoundingSailsApp} app
   * @returns {void}
   */
  function activateGlobalApp(app) {
    globalThis.sails = app
    globalThis.sounding = app.sounding || app.hooks?.sounding
  }

  /**
   * @returns {void}
   */
  function syncGlobalApp() {
    const activeApp = liftedApp || loadedApp

    if (activeApp) {
      activateGlobalApp(activeApp)
      return
    }

    delete globalThis.sails
    delete globalThis.sounding
    outputFilter?.uninstall()
  }

  /**
   * @param {'load' | 'lift'} mode
   * @returns {void}
   */
  function recordLifecycleStart(mode) {
    const entry = lifecycle[mode]
    entry.status = 'loading'
    entry.runs += 1
    entry.error = null
    entry.startedAt = new Date().toISOString()
    entry.readyAt = null
    entry.durationMs = null
  }

  /**
   * @param {'load' | 'lift'} mode
   * @param {number} startedAt
   * @returns {void}
   */
  function recordLifecycleReady(mode, startedAt) {
    const entry = lifecycle[mode]
    entry.status = 'ready'
    entry.durationMs = Date.now() - startedAt
    entry.readyAt = new Date().toISOString()
    reportLifecycle(`app ${mode} ready in ${entry.durationMs}ms`)
  }

  /**
   * @param {'load' | 'lift'} mode
   * @param {unknown} error
   * @returns {void}
   */
  function recordLifecycleError(mode, error) {
    const entry = lifecycle[mode]
    entry.status = 'error'
    entry.error = error instanceof Error ? error.message : String(error)
    reportLifecycle(`app ${mode} failed: ${entry.error}`)
  }

  /**
   * @param {'load' | 'lift'} mode
   * @returns {void}
   */
  function recordLifecycleReuse(mode) {
    const entry = lifecycle[mode]
    entry.reuses += 1
    reportLifecycle(`app ${mode} reused warm instance`)
  }

  /**
   * @param {'load' | 'lift'} mode
   * @returns {void}
   */
  function recordLifecycleReload(mode) {
    lifecycle[mode].reloads += 1
    reportLifecycle(`app ${mode} reload requested`)
  }

  /**
   * @param {'load' | 'lift'} mode
   * @returns {void}
   */
  function recordLifecycleIdle(mode) {
    lifecycle[mode].status = 'idle'
  }

  /**
   * @param {SoundingSailsApp} app
   * @returns {Promise<void>}
   */
  async function lowerApp(app) {
    await new Promise((resolve) => {
      app.lower(() => resolve())
    })
  }

  /**
   * @param {'load' | 'lift'} mode
   * @returns {Promise<void>}
   */
  async function lowerMode(mode) {
    const app = mode === 'load' ? loadedApp : liftedApp

    if (mode === 'load') {
      loadedApp = null
      loadPromise = null
    } else {
      liftedApp = null
      liftPromise = null
    }

    if (app) {
      await lowerApp(app)
    }

    recordLifecycleIdle(mode)
    syncGlobalApp()
  }

  /**
   * @param {'load' | 'lift'} mode
   * @param {{ reload?: boolean }} [options]
   * @returns {Promise<void>}
   */
  async function prepareReload(mode, options = {}) {
    if (!options.reload) {
      return
    }

    recordLifecycleReload(mode)

    if (mode === 'load' && loadPromise) {
      await loadPromise.catch(() => {})
    }

    if (mode === 'lift' && liftPromise) {
      await liftPromise.catch(() => {})
    }

    await lowerMode(mode)
  }

  /**
   * @returns {SoundingAppManager['lifecycle']}
   */
  function getLifecycleSnapshot() {
    return {
      load: { ...lifecycle.load },
      lift: { ...lifecycle.lift },
    }
  }

  async function load(options = {}) {
    await prepareReload('load', options)

    if (loadedApp) {
      activateGlobalApp(loadedApp)
      recordLifecycleReuse('load')
      return loadedApp
    }

    if (loadPromise) {
      recordLifecycleReuse('load')
      return loadPromise
    }

    const Sails = resolveSailsConstructor()
    const sailsApp = new Sails()
    const nextLoadOptions = buildOptions('load')
    const startedAt = Date.now()
    recordLifecycleStart('load')
    outputFilter?.install()

    loadPromise = new Promise((resolve, reject) => {
      sailsApp.load(nextLoadOptions, (error, loadedSails) => {
        if (error) {
          loadPromise = null
          recordLifecycleError('load', error)
          cleanupManagedArtifacts().catch(() => {})
          syncGlobalApp()
          reject(error)
          return
        }

        loadedApp = loadedSails
        activateGlobalApp(loadedSails)
        recordLifecycleReady('load', startedAt)
        resolve(loadedSails)
      })
    })

    return loadPromise
  }

  async function lift(options = {}) {
    await prepareReload('lift', options)

    if (liftedApp) {
      activateGlobalApp(liftedApp)
      recordLifecycleReuse('lift')
      return liftedApp
    }

    if (liftPromise) {
      recordLifecycleReuse('lift')
      return liftPromise
    }

    const Sails = resolveSailsConstructor()
    const sailsApp = new Sails()
    const nextLiftOptions = buildOptions('lift')
    const startedAt = Date.now()
    recordLifecycleStart('lift')
    outputFilter?.install()

    liftPromise = new Promise((resolve, reject) => {
      sailsApp.lift(nextLiftOptions, (error, liftedSails) => {
        if (error) {
          liftPromise = null
          recordLifecycleError('lift', error)
          cleanupManagedArtifacts().catch(() => {})
          syncGlobalApp()
          reject(error)
          return
        }

        liftedApp = liftedSails
        activateGlobalApp(liftedSails)
        recordLifecycleReady('lift', startedAt)
        resolve(liftedSails)
      })
    })

    return liftPromise
  }

  function resolveRuntimeMode(options = {}) {
    if (options.app !== undefined) {
      if (options.app === 'load' || options.app === 'lift') {
        return options.app
      }

      throw createSoundingError({
        code: 'E_SOUNDING_APP_MODE_UNKNOWN',
        name: 'SoundingAppLifecycleError',
        message: `Sounding app lifecycle mode must be \`load\` or \`lift\`. Received \`${options.app}\`.`,
        details: {
          app: options.app,
          allowed: ['load', 'lift'],
        },
      })
    }

    if (options.transport === 'http' || options.http) {
      return 'lift'
    }

    return 'load'
  }

  async function runtime(options = {}) {
    const mode = resolveRuntimeMode(options)
    const app = mode === 'lift' ? await lift(options) : await load(options)
    return app.sounding || app.hooks?.sounding
  }

  async function lower() {
    const apps = [loadedApp, liftedApp].filter(Boolean)

    loadedApp = null
    liftedApp = null
    loadPromise = null
    liftPromise = null

    await Promise.all(apps.map((app) => lowerApp(app)))

    delete globalThis.sails
    delete globalThis.sounding
    outputFilter?.uninstall()
    recordLifecycleIdle('load')
    recordLifecycleIdle('lift')
    await cleanupManagedArtifacts()
  }

  return {
    load,
    lift,
    runtime,
    lower,
    resolveConfig,
    get lifecycle() {
      return getLifecycleSnapshot()
    },
  }
}

module.exports = {
  assertManagedDatastoreDependency,
  buildManagedDatastoreOverrides,
  createAppManager,
  defaultLoadSails,
  loadAppSoundingConfig,
}
