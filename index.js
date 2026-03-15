const { createRuntime } = require('./lib/create-runtime')
const { createAppManager } = require('./lib/create-app-manager')
const { createMailbox } = require('./lib/create-mailbox')
const { createMailCapture } = require('./lib/create-mail-capture')
const { createWorldEngine } = require('./lib/create-world-engine')
const { loadWorldFiles } = require('./lib/create-world-loader')
const { defineFactory, defineScenario } = require('./lib/define-world')
const { createHelperRunner } = require('./lib/create-helper-runner')
const { createRequestClient } = require('./lib/create-request-client')
const { createVisitClient } = require('./lib/create-visit-client')
const { createBrowserManager } = require('./lib/create-browser-manager')
const { createAuthHelpers } = require('./lib/create-auth-helpers')
const { createExpect } = require('./lib/create-expect')
const { createTestApi } = require('./lib/create-test-api')
const { getDefaultConfig } = require('./lib/default-config')

function soundingHook(sails) {
  const runtime = createRuntime(sails)

  return {
    defaults: {
      sounding: getDefaultConfig(),
    },

    configure() {
      sails.hooks ||= {}
      sails.sounding = runtime
      sails.hooks.sounding = this
      runtime.configure()
    },

    initialize(done) {
      sails.sounding = runtime
      Object.assign(this, runtime)
      sails.hooks.sounding = this
      return done()
    },
  }
}

module.exports = soundingHook
module.exports.test = createTestApi()
module.exports.expect = createExpect
module.exports.defineFactory = defineFactory
module.exports.defineScenario = defineScenario
module.exports.createRuntime = createRuntime
module.exports.createAppManager = createAppManager
module.exports.createMailbox = createMailbox
module.exports.createWorldEngine = createWorldEngine
module.exports.loadWorldFiles = loadWorldFiles
module.exports.createHelperRunner = createHelperRunner
module.exports.createRequestClient = createRequestClient
module.exports.createVisitClient = createVisitClient
module.exports.createBrowserManager = createBrowserManager
module.exports.createAuthHelpers = createAuthHelpers
module.exports.createExpect = createExpect
module.exports.createTestApi = createTestApi
module.exports.getDefaultConfig = getDefaultConfig
module.exports.createMailCapture = createMailCapture
