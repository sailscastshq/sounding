const test = require('node:test')
const assert = require('node:assert/strict')

const { createTestApi } = require('../lib/create-test-api')

test('test() boots the runtime and passes a Sails-native helper context', async () => {
  const calls = []
  const baseRegistrations = []
  const runtime = {
    helpers: {
      user: {
        signupWithTeam: async (inputs) => ({
          user: { email: inputs.email },
          team: { name: `${inputs.fullName}'s Team` },
        }),
      },
    },
    world: {
      use: async () => ({}),
    },
    mailbox: {
      latest: () => null,
    },
    request: {
      get: async () => ({ status: 200, data: { ok: true } }),
    },
    async boot(options) {
      calls.push(['boot', options.mode])
      return {
        sails: {
          config: {},
        },
      }
    },
    async lower() {
      calls.push(['lower'])
    },
  }

  const baseTest = (title, options, handler) => {
    baseRegistrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({
    baseTest,
    runtime,
  })

  soundingTest('signupWithTeam returns a team', async ({ sails, expect }) => {
    const result = await sails.helpers.user.signupWithTeam({
      fullName: 'Kelvin O',
      email: 'kelvin@example.com',
    })

    expect(result.user.email).toBe('kelvin@example.com')
    expect(result.team.name).toContain('Kelvin O')
    assert.equal(sails.sounding, runtime)
  })

  assert.equal(baseRegistrations.length, 1)
  await baseRegistrations[0].handler({})
  assert.deepEqual(calls, [
    ['boot', 'trial'],
    ['lower'],
  ])
})

test('test() exposes request verb aliases for endpoint-style trials', async () => {
  const calls = []
  const baseRegistrations = []
  const runtime = {
    helpers: {},
    world: {
      use: async () => ({}),
    },
    mailbox: {
      latest: () => null,
    },
    request: {
      get: async () => ({
        status: 200,
        data: {
          ok: true,
        },
        header: () => null,
      }),
    },
    async boot(options) {
      calls.push(['boot', options.mode])
      return {
        sails: {
          config: {},
        },
      }
    },
    async lower() {
      calls.push(['lower'])
    },
  }

  const baseTest = (title, options, handler) => {
    baseRegistrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({
    baseTest,
    runtime,
  })

  soundingTest('health endpoint is available', async ({ get, request, expect, sails }) => {
    const response = await get('/health')

    expect(response).toHaveStatus(200)
    expect(response).toHaveJsonPath('ok', true)
    assert.equal(request, sails.sounding.request)
  })

  assert.equal(baseRegistrations.length, 1)
  await baseRegistrations[0].handler({})
  assert.deepEqual(calls, [
    ['boot', 'trial'],
    ['lower'],
  ])
})

test('test() can override transport for the whole trial', async () => {
  const calls = []
  const baseRegistrations = []
  const runtime = {
    helpers: {},
    world: {
      use: async () => ({}),
    },
    mailbox: {
      latest: () => null,
    },
    request: {
      transport: 'virtual',
      using(transport) {
        calls.push(['using', transport])
        return {
          transport,
          get: async () => ({
            status: 200,
            data: { transport },
            header: () => null,
          }),
        }
      },
      get: async () => ({
        status: 200,
        data: { transport: 'virtual' },
        header: () => null,
      }),
    },
    visit: {
      transport: 'virtual',
      using(transport) {
        calls.push(['visit:using', transport])
        return {
          transport,
        }
      },
    },
    async boot(options) {
      calls.push(['boot', options.mode])
      return {
        sails: {
          config: {},
        },
      }
    },
    async lower() {
      calls.push(['lower'])
    },
  }

  const baseTest = (title, options, handler) => {
    baseRegistrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({ baseTest, runtime })

  soundingTest(
    'csrf path can opt into http transport',
    { transport: 'http' },
    async ({ get, expect, request, sails }) => {
      const response = await get('/signup')

      expect(response).toHaveStatus(200)
      expect(response).toHaveJsonPath('transport', 'http')
      assert.equal(typeof request.get, 'function')
      assert.equal(request.transport, 'http')
      assert.equal(sails.sounding.request.transport, 'virtual')
    }
  )

  await baseRegistrations[0].handler({})
  assert.deepEqual(calls, [
    ['boot', 'trial'],
    ['using', 'http'],
    ['visit:using', 'http'],
    ['lower'],
  ])
})

test('test.only() runs focused trials through the Sounding wrapper', async () => {
  const calls = []
  const baseRegistrations = []
  const onlyRegistrations = []
  const runtime = {
    helpers: {},
    world: {
      use: async () => ({}),
    },
    mailbox: {
      latest: () => null,
    },
    request: {
      transport: 'virtual',
      using(transport) {
        calls.push(['using', transport])
        return {
          transport,
          get: async () => ({
            status: 200,
            data: { transport },
            header: () => null,
          }),
        }
      },
      get: async () => ({
        status: 200,
        data: { transport: 'virtual' },
        header: () => null,
      }),
    },
    visit: {
      transport: 'virtual',
      using(transport) {
        calls.push(['visit:using', transport])
        return {
          transport,
        }
      },
    },
    browser: {
      async open(options) {
        calls.push(['browser:open', options])
        return {
          browser: { name: 'browser' },
          context: { name: 'context' },
          page: { name: 'page' },
        }
      },
    },
    async boot(options) {
      calls.push(['boot', options.mode])
      return {
        sails: {
          config: {},
        },
      }
    },
    async lower() {
      calls.push(['lower'])
    },
  }

  const baseTest = (title, options, handler) => {
    baseRegistrations.push({ title, options, handler })
    return { title }
  }
  baseTest.only = (title, options, handler) => {
    onlyRegistrations.push({ title, options, handler })
    return { title, only: true }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({ baseTest, runtime })

  soundingTest.only(
    'focused http browser trial',
    { transport: 'http', browser: { project: 'desktop' }, timeout: 500 },
    async ({ sails, get, request, visit, page, expect }) => {
      const response = await get('/health')

      expect(response).toHaveStatus(200)
      expect(response).toHaveJsonPath('transport', 'http')
      assert.equal(sails.sounding, runtime)
      assert.equal(request.transport, 'http')
      assert.equal(visit.transport, 'http')
      assert.deepEqual(page, { name: 'page' })
    }
  )

  assert.equal(baseRegistrations.length, 0)
  assert.equal(onlyRegistrations.length, 1)
  assert.deepEqual(onlyRegistrations[0].options, {
    concurrency: false,
    timeout: 500,
  })

  await onlyRegistrations[0].handler({})
  assert.deepEqual(calls, [
    ['boot', 'trial'],
    ['using', 'http'],
    ['visit:using', 'http'],
    ['browser:open', { project: 'desktop' }],
    ['lower'],
  ])
})

test('test() reports malformed trial arguments with stable codes', () => {
  const baseRegistrations = []
  const baseTest = (title, options, handler) => {
    baseRegistrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({ baseTest })

  assert.throws(
    () => {
      soundingTest()
    },
    (error) => {
      assert.equal(error.name, 'SoundingTestArgumentError')
      assert.equal(error.code, 'E_SOUNDING_TEST_TITLE_REQUIRED')
      assert.equal(error.path, 'name')
      assert.equal(error.signature, 'test(name, [options], handler)')
      assert.match(error.message, /requires a non-empty trial name/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('missing handler', { browser: true })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_HANDLER_REQUIRED')
      assert.equal(error.path, 'handler')
      assert.equal(error.signature, 'test(name, [options], handler)')
      assert.match(error.message, /requires a trial handler/)
      assert.match(error.suggestion, /async function/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('bad options', 'http', async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options')
      assert.equal(error.value, 'http')
      assert.match(error.message, /options must be an object/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('bad transport', { transport: 'socket' }, async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.transport')
      assert.equal(error.value, 'socket')
      assert.deepEqual(error.allowed, ['virtual', 'http'])
      assert.match(error.suggestion, /Use `virtual`/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('bad browser', { browser: 'mobile' }, async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.browser')
      assert.equal(error.value, 'mobile')
      assert.match(error.suggestion, /browser: true/)
      return true
    }
  )

  assert.equal(baseRegistrations.length, 0)
})

test('test.only() reports malformed focused trial arguments with stable codes', () => {
  const onlyRegistrations = []
  const baseTest = () => {
    throw new Error('base test should not be used')
  }
  baseTest.only = (title, options, handler) => {
    onlyRegistrations.push({ title, options, handler })
    return { title, only: true }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({ baseTest })

  assert.throws(
    () => {
      soundingTest.only('focused without handler')
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_HANDLER_REQUIRED')
      assert.equal(error.api, 'test.only')
      assert.equal(error.signature, 'test.only(name, [options], handler)')
      assert.match(error.message, /test\.only/)
      return true
    }
  )

  assert.equal(onlyRegistrations.length, 0)
})

test('test.skip() and test.todo() preserve Node-compatible pass-through forms', () => {
  const skipped = []
  const todos = []
  const baseTest = () => {
    throw new Error('base test should not be used')
  }
  baseTest.skip = (...args) => {
    skipped.push(args)
    return { skipped: true }
  }
  baseTest.todo = (...args) => {
    todos.push(args)
    return { todo: true }
  }

  const soundingTest = createTestApi({ baseTest })
  const skipResult = soundingTest.skip('skip for later')
  const todoResult = soundingTest.todo('document later')

  assert.deepEqual(skipResult, { skipped: true })
  assert.deepEqual(todoResult, { todo: true })
  assert.deepEqual(skipped, [['skip for later']])
  assert.deepEqual(todos, [['document later']])
})

test('test() exposes visit for Inertia-style trials', async () => {
  const calls = []
  const baseRegistrations = []
  const runtime = {
    helpers: {},
    world: {
      use: async () => ({}),
    },
    mailbox: {
      latest: () => null,
    },
    request: {
      transport: 'virtual',
    },
    visit: Object.assign(
      async (target) => {
        calls.push(['visit', target])
        return {
          status: 200,
          data: {
            component: 'billing/pricing',
            props: { plans: [] },
          },
          header: () => null,
        }
      },
      {
        transport: 'virtual',
        using(transport) {
          calls.push(['using', transport])
          return Object.assign(
            async (target) => {
              calls.push(['visit:scoped', target])
              return {
                status: 200,
                data: {
                  component: 'billing/pricing',
                  props: { transport },
                },
                header: () => null,
              }
            },
            {
              transport,
            }
          )
        },
      }
    ),
    async boot(options) {
      calls.push(['boot', options.mode])
      return {
        sails: {
          config: {},
        },
      }
    },
    async lower() {
      calls.push(['lower'])
    },
  }

  const baseTest = (title, options, handler) => {
    baseRegistrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({ baseTest, runtime })

  soundingTest('pricing page can be visited as an Inertia response', async ({ visit, expect, sails }) => {
    const page = await visit('/pricing')

    expect(page).toBeInertiaPage('billing/pricing')
    expect(page).toHaveProp('plans', [])
    assert.equal(visit.transport, 'virtual')
    assert.equal(sails.sounding.visit.transport, 'virtual')
  })

  await baseRegistrations[0].handler({})
  assert.deepEqual(calls, [
    ['boot', 'trial'],
    ['visit', '/pricing'],
    ['lower'],
  ])
})
