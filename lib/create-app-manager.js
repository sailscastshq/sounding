const fs = require('node:fs')
const path = require('node:path')

const { getDefaultConfig } = require('./default-config')
const { mergeConfig } = require('./merge-config')
const { normalizeUserConfig } = require('./normalize-config')
const { buildManagedSqlitePath, resolveManagedRoot } = require('./resolve-datastore')
const { validateConfig } = require('./validate-config')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingAppManager} SoundingAppManager */
/** @typedef {import('./types').SoundingAppManagerOptions} SoundingAppManagerOptions */
/** @typedef {import('./types').SoundingConfig} SoundingConfig */
/** @typedef {import('./types').SoundingRuntime} SoundingRuntime */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {string} appPath
 * @param {string} moduleId
 * @returns {any}
 */
function resolveModuleFromApp(appPath, moduleId) {
  return require(require.resolve(moduleId, { paths: [appPath, process.cwd(), __dirname] }))
}

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
 * @param {SoundingConfig} config
 * @param {string} appPath
 * @returns {AnyRecord}
 */
function buildManagedDatastoreOverrides(config, appPath) {
  if (config.datastore?.mode !== 'managed') {
    return {}
  }

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
} = {}) {
  let loadedApp = null
  let liftedApp = null
  let loadPromise = null
  let liftPromise = null
  const managedArtifacts = new Set()
  let outputFilter = null

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

    return resolveModuleFromApp(resolveAppPath(), 'sails').constructor
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

  async function load() {
    if (loadedApp) {
      return loadedApp
    }

    if (loadPromise) {
      return loadPromise
    }

    const Sails = resolveSailsConstructor()
    const sailsApp = new Sails()
    const nextLoadOptions = buildOptions('load')
    outputFilter?.install()

    loadPromise = new Promise((resolve, reject) => {
      sailsApp.load(nextLoadOptions, (error, loadedSails) => {
        if (error) {
          loadPromise = null
          cleanupManagedArtifacts().catch(() => {})
          outputFilter?.uninstall()
          reject(error)
          return
        }

        loadedApp = loadedSails
        globalThis.sails = loadedSails
        globalThis.sounding = loadedSails.sounding
        resolve(loadedSails)
      })
    })

    return loadPromise
  }

  async function lift() {
    if (liftedApp) {
      return liftedApp
    }

    if (liftPromise) {
      return liftPromise
    }

    const Sails = resolveSailsConstructor()
    const sailsApp = new Sails()
    const nextLiftOptions = buildOptions('lift')
    outputFilter?.install()

    liftPromise = new Promise((resolve, reject) => {
      sailsApp.lift(nextLiftOptions, (error, liftedSails) => {
        if (error) {
          liftPromise = null
          cleanupManagedArtifacts().catch(() => {})
          outputFilter?.uninstall()
          reject(error)
          return
        }

        liftedApp = liftedSails
        globalThis.sails = liftedSails
        globalThis.sounding = liftedSails.sounding
        resolve(liftedSails)
      })
    })

    return liftPromise
  }

  async function runtime(options = {}) {
    const app = options.http ? await lift() : await load()
    return app.sounding || app.hooks?.sounding
  }

  async function lower() {
    const apps = [loadedApp, liftedApp].filter(Boolean)

    loadedApp = null
    liftedApp = null
    loadPromise = null
    liftPromise = null

    await Promise.all(
      apps.map(
        (app) =>
          new Promise((resolve) => {
            app.lower(() => resolve())
          })
      )
    )

    delete globalThis.sails
    delete globalThis.sounding
    outputFilter?.uninstall()
    await cleanupManagedArtifacts()
  }

  return {
    load,
    lift,
    runtime,
    lower,
    resolveConfig,
  }
}

module.exports = {
  createAppManager,
  loadAppSoundingConfig,
}
