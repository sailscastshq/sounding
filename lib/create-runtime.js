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

function resolveConfig(sails) {
  return mergeConfig(getDefaultConfig(), normalizeUserConfig(sails.config?.sounding || {}))
}

function resolveAppPath(sails, config) {
  const basePath = sails?.config?.appPath || process.cwd()
  return path.resolve(basePath, config.app?.path || '.')
}

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
