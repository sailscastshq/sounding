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
