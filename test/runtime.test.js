const test = require('node:test')
const assert = require('node:assert/strict')

const soundingHook = require('../index')
const { createRuntime, resolveConfig } = require('../lib/create-runtime')
const { getDefaultConfig } = require('../lib/default-config')
const { buildManagedSqlitePath } = require('../lib/resolve-datastore')

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
  assert.equal(config.browser.projects[0], 'desktop')
})

test('Sounding normalizes shorthand and legacy datastore config shapes', () => {
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

  const legacyManaged = resolveConfig({
    config: {
      sounding: {
        datastore: {
          managed: {
            directory: '.tmp/custom-db',
            isolation: 'run',
          },
        },
      },
    },
  })

  assert.equal(legacyManaged.datastore.mode, 'managed')
  assert.equal(legacyManaged.datastore.root, '.tmp/custom-db')
  assert.equal(legacyManaged.datastore.isolation, 'run')
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
