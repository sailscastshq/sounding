const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const soundingHook = require('../index')
const { createRuntime, resolveConfig } = require('../lib/create-runtime')
const { getDefaultConfig } = require('../lib/default-config')
const { buildManagedSqlitePath, resolveDatastore } = require('../lib/resolve-datastore')

function createMailSend() {
  const send = async () => ({})
  send.with = async () => ({})
  return send
}

function createMailEnabledSails(send) {
  return {
    config: {
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
    },
    models: {},
    helpers: {
      mail: {
        send,
      },
    },
  }
}

test('Sounding resolves calm Sails-native defaults', () => {
  const config = resolveConfig({ config: {} })

  assert.deepEqual(config, getDefaultConfig())
  assert.deepEqual(config.environments, ['test'])
  assert.equal(config.datastore.mode, 'managed')
  assert.equal(config.datastore.identity, 'default')
  assert.equal(config.datastore.adapter, 'sails-sqlite')
  assert.equal(config.datastore.root, '.tmp/db')
  assert.equal(config.datastore.isolation, 'worker')
  assert.equal(config.request.transport, 'virtual')
  assert.equal(config.sockets.enabled, true)
  assert.equal(config.sockets.path, '/socket.io')
  assert.equal(config.browser.projects[0], 'desktop')
})

test('Sounding normalizes shorthand datastore config', () => {
  const shorthand = resolveConfig({
    config: {
      sounding: {
        datastore: 'inherit',
      },
    },
  })

  assert.equal(shorthand.datastore.mode, 'inherit')
  assert.equal(shorthand.datastore.root, '.tmp/db')
  assert.equal(shorthand.datastore.adapter, 'sails-sqlite')
})

test('createRuntime caches resolved config until Sails config changes or caches are invalidated', () => {
  const sails = {
    config: {
      sounding: {
        request: {
          transport: 'virtual',
        },
      },
    },
    models: {},
    helpers: {},
  }
  const runtime = createRuntime(sails)

  assert.equal(runtime.cacheStats.config.resolutions, 0)

  const first = runtime.config
  const repeated = runtime.config

  assert.equal(repeated, first)
  assert.equal(runtime.cacheStats.config.resolutions, 1)

  sails.config.sounding.request.transport = 'http'
  const changed = runtime.config

  assert.notEqual(changed, first)
  assert.equal(changed.request.transport, 'http')
  assert.equal(runtime.cacheStats.config.resolutions, 2)

  runtime.invalidateCaches()
  assert.equal(runtime.cacheStats.config.resolutions, 0)

  const afterInvalidation = runtime.config

  assert.notEqual(afterInvalidation, changed)
  assert.equal(afterInvalidation.request.transport, 'http')
  assert.equal(runtime.cacheStats.config.resolutions, 1)
})

test('createRuntime reuses cached world loading between repeated boots', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-runtime-worlds-'))
  const factoriesDir = path.join(tempRoot, 'tests', 'factories')
  const scenariosDir = path.join(tempRoot, 'tests', 'scenarios')

  fs.mkdirSync(factoriesDir, { recursive: true })
  fs.mkdirSync(scenariosDir, { recursive: true })
  fs.writeFileSync(
    path.join(factoriesDir, 'user.js'),
    "module.exports = ({ factory }) => factory('user', { email: 'reader@example.com' })\n"
  )
  fs.writeFileSync(
    path.join(scenariosDir, 'signed-in-user.js'),
    "module.exports = ({ scenario }) => scenario('signed-in-user', ({ build }) => ({ user: build('user') }))\n"
  )

  const runtime = createRuntime({
    config: {
      appPath: tempRoot,
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
      sounding: {
        datastore: 'inherit',
        world: {
          factories: 'tests/factories',
          scenarios: 'tests/scenarios',
        },
      },
    },
    models: {},
    helpers: {},
  })

  await runtime.boot()
  assert.deepEqual(runtime.cacheStats, {
    config: {
      resolutions: 1,
    },
    worldLoader: {
      directoryScans: 2,
      moduleLoads: 2,
    },
  })
  assert.deepEqual(runtime.world.factories, ['user'])
  assert.deepEqual(runtime.world.scenarios, ['signed-in-user'])

  await runtime.lower()
  await runtime.boot()

  assert.deepEqual(runtime.cacheStats, {
    config: {
      resolutions: 1,
    },
    worldLoader: {
      directoryScans: 2,
      moduleLoads: 2,
    },
  })
  assert.deepEqual(runtime.world.factories, ['user'])
  assert.deepEqual(runtime.world.scenarios, ['signed-in-user'])

  await runtime.lower()
  runtime.invalidateCaches()
  await runtime.boot()

  assert.deepEqual(runtime.cacheStats, {
    config: {
      resolutions: 1,
    },
    worldLoader: {
      directoryScans: 2,
      moduleLoads: 2,
    },
  })
  assert.deepEqual(runtime.world.factories, ['user'])
  assert.deepEqual(runtime.world.scenarios, ['signed-in-user'])

  await runtime.lower()
})

test('resolveDatastore reports configuration errors with stable codes', () => {
  assert.throws(
    () => {
      resolveDatastore({
        sails: {
          config: {
            datastores: {},
          },
        },
        soundingConfig: {
          datastore: {
            mode: 'inherit',
            identity: 'archive',
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_DATASTORE_CONFIG_MISSING')
      assert.equal(error.mode, 'inherit')
      assert.equal(error.identity, 'archive')
      return true
    }
  )

  assert.throws(
    () => {
      resolveDatastore({
        sails: {
          config: {
            datastores: {},
          },
        },
        soundingConfig: {
          datastore: {
            mode: 'managed',
            adapter: 'sails-postgresql',
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_DATASTORE_ADAPTER_UNSUPPORTED')
      assert.equal(error.adapter, 'sails-postgresql')
      return true
    }
  )

  assert.throws(
    () => {
      resolveDatastore({
        sails: {
          config: {
            datastores: {},
          },
        },
        soundingConfig: {
          datastore: {
            mode: 'custom',
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_DATASTORE_MODE_UNKNOWN')
      assert.equal(error.mode, 'custom')
      return true
    }
  )
})

test('createRuntime manages a temporary datastore by default', async () => {
  const sails = {
    config: {
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
    },
    models: {},
    helpers: {
      user: {
        signupWithTeam: {
          with: async (inputs) => ({
            user: { email: inputs.email },
            team: { name: `${inputs.fullName}'s Team` },
          }),
        },
      },
    },
  }

  const runtime = createRuntime(sails)
  const booted = await runtime.boot({ mode: 'browser' })

  assert.equal(booted.mode, 'browser')
  assert.equal(booted.config.datastore.mode, 'managed')
  assert.equal(booted.datastore.identity, 'default')
  assert.equal(booted.datastore.config.adapter, 'sails-sqlite')
  assert.match(booted.datastore.config.url, /\.tmp\/db\/default\/worker-\d+\.db$/)
  assert.equal(runtime.request.transport, 'virtual')
  assert.equal(runtime.visit.transport, 'virtual')
  assert.equal(typeof runtime.sockets.connect, 'function')

  const resultFromChain = await runtime.helpers.user.signupWithTeam({
    fullName: 'Kelvin O',
    email: 'kelvin@example.com',
  })
  const resultFromString = await runtime.helpers('user.signupWithTeam', {
    fullName: 'Kelvin O',
    email: 'kelvin@example.com',
  })

  assert.equal(resultFromChain.user.email, 'kelvin@example.com')
  assert.equal(resultFromChain.team.name, "Kelvin O's Team")
  assert.equal(resultFromString.user.email, 'kelvin@example.com')

  runtime.mailbox.capture({ to: ['reader@example.com'], subject: 'Sign in' })
  assert.equal(runtime.mailbox.latest().subject, 'Sign in')

  runtime.world.defineFactory('user', ({ sequence }) => ({
    email: sequence('user', (number) => `user${number}@example.com`),
  }))

  const built = runtime.world.build('user')
  assert.equal(built.email, 'user1@example.com')

  await runtime.lower()
  assert.equal(runtime.mailbox.all().length, 0)
  assert.equal(runtime.world.factories.length, 0)
})

test('createRuntime helper runner reports lookup errors with stable codes', async () => {
  const runtime = createRuntime({
    config: {},
    models: {},
    helpers: {
      user: {
        signupWithTeam: {},
      },
    },
  })

  await assert.rejects(
    async () => {
      await runtime.helpers('user.missing')
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_HELPER_UNKNOWN')
      assert.equal(error.identity, 'user.missing')
      assert.deepEqual(error.details, {
        identity: 'user.missing',
      })
      return true
    }
  )

  await assert.rejects(
    async () => {
      await runtime.helpers.user.signupWithTeam()
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_HELPER_NOT_CALLABLE')
      assert.equal(error.identity, 'user.signupWithTeam')
      return true
    }
  )
})

test('createRuntime.lower resets shared virtual request session state', async () => {
  const sails = {
    config: {
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
    },
    models: {},
    helpers: {},
    router: {
      route(req, res) {
        if (req.method === 'POST' && req.url === '/login') {
          req.session.userId = 7
          res._clientRes.statusCode = 302
          res._clientRes.headers = {
            location: '/dashboard',
          }
          res._clientRes.end('')
          return
        }

        if (req.method === 'GET' && req.url === '/dashboard') {
          res._clientRes.statusCode = 200
          res._clientRes.headers = {
            'content-type': 'application/json',
          }
          res._clientRes.end(
            JSON.stringify({
              userId: req.session.userId || null,
            })
          )
          return
        }

        res._clientRes.statusCode = 404
        res._clientRes.end('')
      },
    },
  }

  const runtime = createRuntime(sails)

  await runtime.boot()
  await runtime.request.post('/login', {
    email: 'reader@example.com',
    password: 'secret123',
  })

  let response = await runtime.request.get('/dashboard')
  assert.deepEqual(await response.json(), { userId: 7 })

  await runtime.lower()
  await runtime.boot()

  response = await runtime.request.get('/dashboard')
  assert.deepEqual(await response.json(), { userId: null })

  await runtime.lower()
})

test('createRuntime.lower continues cleanup and reports browser close failures', async () => {
  const originalSend = createMailSend()
  const sails = createMailEnabledSails(originalSend)
  const runtime = createRuntime(sails)
  await runtime.boot()

  assert.notEqual(sails.helpers.mail.send, originalSend)

  runtime.mailbox.capture({ to: ['reader@example.com'], subject: 'Sign in' })
  runtime.world.defineFactory('user', () => ({
    email: 'reader@example.com',
  }))
  runtime.browser.close = async () => {
    throw new Error('browser close failed')
  }

  let cleanupError
  await assert.rejects(
    async () => {
      await runtime.lower()
    },
    (error) => {
      cleanupError = error
      return error instanceof AggregateError && error.message === 'Sounding cleanup failed for browser.'
    }
  )

  assert.equal(cleanupError.code, 'E_SOUNDING_CLEANUP_FAILED')
  assert.deepEqual(cleanupError.resources, ['browser'])
  assert.equal(cleanupError.errors[0].code, 'E_SOUNDING_CLEANUP_RESOURCE_FAILED')
  assert.equal(cleanupError.errors[0].resource, 'browser')
  assert.equal(cleanupError.errors[0].message, 'browser: browser close failed')
  assert.equal(sails.helpers.mail.send, originalSend)
  assert.equal(runtime.mailbox.all().length, 0)
  assert.equal(runtime.world.factories.length, 0)
  assert.equal(runtime.state, null)
})

test('createRuntime.lower continues cleanup and reports mail capture uninstall failures', async () => {
  const originalSend = createMailSend()
  const sails = createMailEnabledSails(originalSend)
  const runtime = createRuntime(sails)
  await runtime.boot()

  const wrappedSend = sails.helpers.mail.send
  Object.defineProperty(sails.helpers.mail, 'send', {
    configurable: true,
    get() {
      return wrappedSend
    },
    set() {
      throw new Error('mail restore failed')
    },
  })

  let browserClosed = false
  runtime.browser.close = async () => {
    browserClosed = true
  }

  runtime.mailbox.capture({ to: ['reader@example.com'], subject: 'Sign in' })
  runtime.world.defineFactory('user', () => ({
    email: 'reader@example.com',
  }))

  let cleanupError
  await assert.rejects(
    async () => {
      await runtime.lower()
    },
    (error) => {
      cleanupError = error
      return (
        error instanceof AggregateError &&
        error.message === 'Sounding cleanup failed for mail capture.'
      )
    }
  )

  assert.equal(cleanupError.code, 'E_SOUNDING_CLEANUP_FAILED')
  assert.deepEqual(cleanupError.resources, ['mail capture'])
  assert.equal(cleanupError.errors[0].code, 'E_SOUNDING_CLEANUP_RESOURCE_FAILED')
  assert.equal(cleanupError.errors[0].resource, 'mail capture')
  assert.equal(cleanupError.errors[0].message, 'mail capture: mail restore failed')
  assert.equal(browserClosed, true)
  assert.equal(runtime.mailbox.all().length, 0)
  assert.equal(runtime.world.factories.length, 0)
  assert.equal(runtime.state, null)
})

test('createRuntime can switch to an inherited datastore explicitly', async () => {
  const sails = {
    config: {
      sounding: {
        datastore: 'inherit',
      },
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
    },
    models: {},
    helpers: {},
  }

  const runtime = createRuntime(sails)
  const datastore = runtime.configure()

  assert.equal(datastore.mode, 'inherit')
  assert.equal(datastore.config.url, '.tmp/test.db')
})

test('buildManagedSqlitePath uses the worker token by default', () => {
  const filePath = buildManagedSqlitePath({
    root: '/tmp',
    identity: 'default',
    env: {
      PLAYWRIGHT_WORKER_INDEX: '4',
    },
  })

  assert.equal(filePath, '/tmp/default/worker-4.db')
})

test('buildManagedSqlitePath lets Sounding worker tokens isolate concurrent lanes', () => {
  const filePath = buildManagedSqlitePath({
    root: '/tmp',
    identity: 'default',
    env: {
      SOUNDING_WORKER_INDEX: 'ci-2',
      PLAYWRIGHT_WORKER_INDEX: '4',
    },
  })

  assert.equal(filePath, '/tmp/default/worker-ci-2.db')
})

test('the hook exposes sails.sounding and sails.hooks.sounding', async () => {
  const sails = {
    config: {
      environment: 'test',
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
      sounding: {
        world: {
          factories: 'tests/factories',
        },
      },
    },
    hooks: {},
    models: {},
    helpers: {},
  }

  const hook = soundingHook(sails)
  hook.configure()

  await new Promise((resolve, reject) => {
    hook.initialize((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

  assert.ok(sails.sounding)
  assert.ok(sails.hooks.sounding)
  assert.equal(typeof sails.sounding.boot, 'function')
  assert.equal(typeof sails.sounding.world.defineFactory, 'function')
  assert.equal(typeof sails.sounding.helpers.user, 'function')
  assert.equal(sails.sounding.request.transport, 'virtual')
  assert.equal(sails.hooks.sounding.boot, sails.sounding.boot)
  assert.equal(sails.sounding.datastore.identity, 'default')
})

for (const environment of ['development', 'console', 'production']) {
  test(`the hook stays disabled in ${environment} by default`, async () => {
    const sails = {
      config: {
        environment,
        sounding: {},
      },
      hooks: {},
      models: {},
      helpers: {},
    }

    const hook = soundingHook(sails)
    hook.configure()

    await new Promise((resolve, reject) => {
      hook.initialize((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

    assert.equal(sails.sounding, undefined)
    assert.equal(sails.hooks.sounding, undefined)
    assert.equal(typeof hook.boot, 'undefined')
  })
}

test('the hook can be enabled explicitly in configured non-test environments', async () => {
  const sails = {
    config: {
      environment: 'console',
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
      sounding: {
        environments: ['test', 'console'],
      },
    },
    hooks: {},
    models: {},
    helpers: {},
  }

  const hook = soundingHook(sails)
  hook.configure()

  await new Promise((resolve, reject) => {
    hook.initialize((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

  assert.ok(sails.sounding)
  assert.ok(sails.hooks.sounding)
  assert.equal(typeof hook.boot, 'function')
})

test('the hook can be enabled explicitly in production through environments', async () => {
  const sails = {
    config: {
      environment: 'production',
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
      sounding: {
        environments: ['test', 'production'],
      },
    },
    hooks: {},
    models: {},
    helpers: {},
  }

  const hook = soundingHook(sails)
  hook.configure()

  await new Promise((resolve, reject) => {
    hook.initialize((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

  assert.ok(sails.sounding)
  assert.ok(sails.hooks.sounding)
  assert.equal(typeof hook.boot, 'function')
})
