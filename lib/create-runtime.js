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
const { getDefaultConfig } = require('./default-config')
const { mergeConfig } = require('./merge-config')
const { normalizeUserConfig } = require('./normalize-config')
const { resolveDatastore } = require('./resolve-datastore')

/** @typedef {import('./types').SoundingBootResult} SoundingBootResult */
/** @typedef {import('./types').SoundingConfig} SoundingConfig */
/** @typedef {import('./types').SoundingRuntime} SoundingRuntime */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {SoundingSailsApp} sails
 * @returns {SoundingConfig}
 */
function resolveConfig(sails) {
  return /** @type {SoundingConfig} */ (
    mergeConfig(getDefaultConfig(), normalizeUserConfig(sails.config?.sounding || {}))
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
        browser,
        auth,
        login: auth.login,
      }
    },

    async lower() {
      request.clearSession()
      bootState = null
      datastoreState = null
      await browser.close()
      mailCapture.uninstall()
      mailbox.clear()
      world.reset({ preserveSequences: true })
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
