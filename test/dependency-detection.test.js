const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  assertManagedDatastoreDependency,
  defaultLoadSails,
} = require('../lib/create-app-manager')
const {
  createBrowserManager,
  defaultLoadPlaywright,
  defaultLoadPlaywrightTest,
} = require('../lib/create-browser-manager')
const {
  createSocketManager,
  defaultLoadSocketIoClient,
  hasSailsSocketSupport,
} = require('../lib/create-socket-manager')
const { getDefaultConfig } = require('../lib/default-config')
const { resolveDependencyFromApp } = require('../lib/resolve-dependency')

/**
 * @param {string} moduleId
 * @returns {never}
 */
function missingResolver(moduleId) {
  const error = new Error(`Cannot find module '${moduleId}'`)
  error.code = 'MODULE_NOT_FOUND'
  throw error
}

test('resolveDependencyFromApp turns missing app dependencies into Sounding setup errors', () => {
  assert.throws(
    () => {
      resolveDependencyFromApp({
        appPath: '/tmp/sounding-consumer',
        moduleId: 'sails',
        purpose: 'load your Sails app',
        install: 'npm install sails',
        resolveImplementation: missingResolver,
      })
    },
    (error) => {
      assert.equal(error.name, 'SoundingDependencyError')
      assert.equal(error.code, 'E_SOUNDING_DEPENDENCY_MISSING')
      assert.equal(error.dependency, 'sails')
      assert.equal(error.moduleId, 'sails')
      assert.equal(error.purpose, 'load your Sails app')
      assert.equal(error.install, 'npm install sails')
      assert.equal(error.appPath, path.resolve('/tmp/sounding-consumer'))
      assert.match(error.message, /Sounding could not find dependency `sails`/)
      assert.match(error.message, /npm install sails/)
      return true
    }
  )
})

test('resolveDependencyFromApp lets optional dependencies degrade when absent', () => {
  const resolved = resolveDependencyFromApp({
    appPath: '/tmp/sounding-consumer',
    moduleId: '@playwright/test',
    optional: true,
    resolveImplementation: missingResolver,
  })

  assert.equal(resolved, null)
})

test('resolveDependencyFromApp does not wrap non-resolution failures', () => {
  const original = new Error('resolver permissions failed')
  original.code = 'EACCES'

  assert.throws(
    () => {
      resolveDependencyFromApp({
        appPath: '/tmp/sounding-consumer',
        moduleId: 'sails',
        resolveImplementation() {
          throw original
        },
      })
    },
    (error) => error === original
  )
})

test('defaultLoadSails explains missing Sails app dependencies', () => {
  assert.throws(
    () => {
      defaultLoadSails('/tmp/sounding-consumer', {
        resolveImplementation: missingResolver,
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_DEPENDENCY_MISSING')
      assert.equal(error.dependency, 'sails')
      assert.match(error.message, /load your Sails app/)
      return true
    }
  )
})

test('managed datastore setup explains missing sails-sqlite', () => {
  const config = getDefaultConfig()

  assert.throws(
    () => {
      assertManagedDatastoreDependency(config, '/tmp/sounding-consumer', {
        resolveImplementation: missingResolver,
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_DEPENDENCY_MISSING')
      assert.equal(error.dependency, 'sails-sqlite')
      assert.equal(error.install, 'npm install -D sails-sqlite')
      assert.match(error.message, /managed datastore trials/)
      assert.match(error.message, /sounding\.datastore/)
      return true
    }
  )
})

test('browser dependency loaders distinguish required and optional Playwright packages', () => {
  assert.throws(
    () => {
      defaultLoadPlaywright('/tmp/sounding-consumer', {
        resolveImplementation: missingResolver,
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_DEPENDENCY_MISSING')
      assert.equal(error.dependency, 'playwright')
      assert.equal(error.install, 'npm install -D playwright')
      assert.match(error.message, /browser trials/)
      return true
    }
  )

  const optionalExpect = defaultLoadPlaywrightTest('/tmp/sounding-consumer', {
    resolveImplementation: missingResolver,
  })

  assert.equal(optionalExpect, null)
})

test('createBrowserManager only swallows the optional @playwright/test missing dependency', async () => {
  const original = new Error('broken expect loader')
  const manager = createBrowserManager({
    sails: {
      config: {
        appPath: '/tmp/sounding-consumer',
        port: 1337,
      },
    },
    loadPlaywright: async () => ({
      chromium: {
        launch: async () => {
          throw new Error('should not launch before expect loader resolves')
        },
      },
      devices: {},
    }),
    loadPlaywrightTest: async () => {
      throw original
    },
  })

  await assert.rejects(
    async () => {
      await manager.open()
    },
    (error) => error === original
  )
})

test('socket dependency loader explains missing socket.io-client', () => {
  assert.throws(
    () => {
      defaultLoadSocketIoClient('/tmp/sounding-consumer', {
        resolveImplementation: missingResolver,
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_DEPENDENCY_MISSING')
      assert.equal(error.dependency, 'socket.io-client')
      assert.equal(error.install, 'npm install -D socket.io-client')
      assert.match(error.message, /websocket trials/)
      return true
    }
  )
})

test('createSocketManager reports missing or disabled Sails socket support before connecting', async () => {
  assert.equal(
    hasSailsSocketSupport({
      hooks: { sockets: {} },
      io: {},
      sockets: {},
    }),
    true
  )
  assert.equal(hasSailsSocketSupport({ hooks: {} }), false)

  const manager = createSocketManager({
    sails: {
      config: {
        appPath: '/tmp/sounding-consumer',
        port: 1337,
      },
      hooks: {
        http: {
          server: {
            address: () => ({
              address: '127.0.0.1',
              port: 1337,
            }),
          },
        },
      },
    },
    getConfig: () => ({
      sockets: {
        enabled: true,
        timeout: 10,
      },
    }),
    loadSocketIoClient: async () => ({
      io() {
        throw new Error('should not connect without the Sails sockets hook')
      },
    }),
  })

  await assert.rejects(
    async () => {
      await manager.connect()
    },
    (error) => {
      assert.equal(error.name, 'SoundingSocketError')
      assert.equal(error.code, 'E_SOUNDING_SOCKET_HOOK_UNAVAILABLE')
      assert.equal(error.dependency, 'sails-hook-sockets')
      assert.equal(error.install, 'npm install sails-hook-sockets')
      assert.match(error.message, /sails-hook-sockets/)
      return true
    }
  )
})
