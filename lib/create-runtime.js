const path = require('node:path')

const { createMailbox } = require('./create-mailbox')
const { createMailCapture } = require('./create-mail-capture')
const { createWorldEngine } = require('./create-world-engine')
const { loadWorldFiles } = require('./create-world-loader')
const { createHelperRunner } = require('./create-helper-runner')
const { createRequestClient } = require('./create-request-client')
const { createVisitClient } = require('./create-visit-client')
const { createBrowserManager } = require('./create-browser-manager')
const { createAuthHelpers } = require('./create-auth-helpers')
const { createSocketManager } = require('./create-socket-manager')
const { getDefaultConfig } = require('./default-config')
const { mergeConfig } = require('./merge-config')
const { normalizeUserConfig } = require('./normalize-config')
const { resolveDatastore } = require('./resolve-datastore')
const { createSoundingError } = require('./create-error')
const { validateConfig } = require('./validate-config')

/** @typedef {import('./types').SoundingBootResult} SoundingBootResult */
/** @typedef {import('./types').SoundingConfig} SoundingConfig */
/** @typedef {import('./types').SoundingRuntime} SoundingRuntime */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {SoundingSailsApp} sails
 * @returns {SoundingConfig}
 */
function resolveConfig(sails) {
  return validateConfig(
    /** @type {SoundingConfig} */ (
      mergeConfig(getDefaultConfig(), normalizeUserConfig(sails.config?.sounding || {}))
    )
  )
}

/**
 * @param {SoundingSailsApp} sails
 * @param {SoundingConfig} config
 * @returns {string}
 */
function resolveAppPath(sails, config) {
  const basePath = sails?.config?.appPath || process.cwd()
  return path.resolve(basePath, config.app?.path || '.')
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatCleanupError(error) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * @param {{ resource: string, cleanup: () => void | Promise<void> }[]} steps
 * @returns {Promise<void>}
 */
async function runCleanupSteps(steps) {
  const failures = []

  for (const step of steps) {
    try {
      await step.cleanup()
    } catch (error) {
      failures.push({
        resource: step.resource,
        error,
      })
    }
  }

  if (failures.length === 0) {
    return
  }

  const resources = failures.map((failure) => failure.resource).join(', ')
  const errors = failures.map(
    (failure) =>
      createSoundingError({
        code: 'E_SOUNDING_CLEANUP_RESOURCE_FAILED',
        message: `${failure.resource}: ${formatCleanupError(failure.error)}`,
        details: {
          resource: failure.resource,
        },
        cause: failure.error,
      })
  )

  const error = /** @type {AggregateError & { code: string, resources: string[], details: { resources: string[] } }} */ (
    new AggregateError(errors, `Sounding cleanup failed for ${resources}.`)
  )
  error.name = 'SoundingCleanupError'
  error.code = 'E_SOUNDING_CLEANUP_FAILED'
  error.resources = failures.map((failure) => failure.resource)
  error.details = {
    resources: error.resources,
  }

  throw error
}

/**
 * Create a Sounding runtime bound to a loaded Sails app.
 *
 * @param {SoundingSailsApp} sails
 * @returns {SoundingRuntime}
 */
function createRuntime(sails) {
  const mailbox = createMailbox()
  const world = createWorldEngine({ sails })
  const helpers = createHelperRunner({ sails })
  const request = createRequestClient({
    sails,
    getConfig: () => resolveConfig(sails),
  })
  const visit = createVisitClient({ request })
  const sockets = createSocketManager({
    sails,
    getConfig: () => resolveConfig(sails),
    world,
  })
  const browser = createBrowserManager({
    sails,
    getConfig: () => resolveConfig(sails),
    appPathResolver: () => resolveAppPath(sails, resolveConfig(sails)),
  })
  const auth = createAuthHelpers({
    sails,
    world,
    mailbox,
    request,
  })
  const mailCapture = createMailCapture({
    sails,
    mailbox,
    getConfig: () => resolveConfig(sails),
  })
  let bootState = null
  let datastoreState = null

  return {
    get config() {
      return resolveConfig(sails)
    },

    get appPath() {
      return resolveAppPath(sails, this.config)
    },

    get mailbox() {
      return mailbox
    },

    get world() {
      return world
    },

    get helpers() {
      return helpers
    },

    // Temporary compatibility alias while the DX settles.
    get helper() {
      return helpers
    },

    get request() {
      return request
    },

    get visit() {
      return visit
    },

    get sockets() {
      return sockets
    },

    get browser() {
      return browser
    },

    get auth() {
      return auth
    },

    configure() {
      datastoreState = resolveDatastore({
        sails,
        soundingConfig: this.config,
      })

      return datastoreState
    },

    get datastore() {
      return datastoreState
    },

    /**
     * @param {{ mode?: string }} [options]
     * @returns {Promise<SoundingBootResult>}
     */
    async boot(options = {}) {
      if (!datastoreState) {
        datastoreState = this.configure()
      }

      world.reset({ preserveSequences: true })
      const loadedWorldFiles = await loadWorldFiles({
        world,
        appPath: this.appPath,
        config: this.config,
        sails,
      })
      const captureInstalled = mailCapture.install()

      bootState = {
        bootedAt: new Date().toISOString(),
        mode: options.mode || 'unit',
        config: this.config,
        datastore: datastoreState,
        mail: {
          captureEnabled: this.config.mail?.capture !== false,
          captureInstalled,
        },
        world: {
          loadedFiles: loadedWorldFiles,
        },
      }

      return {
        sails,
        ...bootState,
        helpers,
        mailbox,
        world,
        request,
        visit,
        sockets,
        browser,
        auth,
        login: auth.login,
      }
    },

    async lower() {
      bootState = null
      datastoreState = null

      await runCleanupSteps([
        {
          resource: 'sockets',
          cleanup: () => sockets.closeAll(),
        },
        {
          resource: 'request session',
          cleanup: () => request.clearSession(),
        },
        {
          resource: 'browser',
          cleanup: () => browser.close(),
        },
        {
          resource: 'mail capture',
          cleanup: () => mailCapture.uninstall(),
        },
        {
          resource: 'mailbox',
          cleanup: () => mailbox.clear(),
        },
        {
          resource: 'world',
          cleanup: () => world.reset({ preserveSequences: true }),
        },
      ])
    },

    get state() {
      return bootState
    },
  }
}

module.exports = {
  createRuntime,
  resolveConfig,
  resolveAppPath,
}
