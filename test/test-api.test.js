const test = require('node:test')
const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')

const { createTestApi } = require('../lib/create-test-api')
const { createRuntime } = require('../lib/create-runtime')

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

test('test() can auto-load a world before the trial handler', async () => {
  const calls = []
  const baseRegistrations = []
  const currentWorld = {
    users: {
      subscriber: {
        id: 42,
        email: 'subscriber@example.com',
      },
    },
  }
  const runtime = {
    helpers: {},
    world: {
      current: null,
      async use(name, context) {
        calls.push(['world:use', name, context])
        this.current = currentWorld
        return currentWorld
      },
    },
    mailbox: {
      latest: () => null,
    },
    request: {
      transport: 'virtual',
      as(actor) {
        calls.push(['request:as', actor])
        return {
          async get(target) {
            calls.push(['request:get', target])
            return {
              status: 200,
              data: {
                actor,
              },
              header: () => null,
            }
          },
        }
      },
    },
    visit: {
      transport: 'virtual',
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
    'subscriber can read the issue',
    { world: { name: 'issue-access', context: { issue: 'first' } }, timeout: 500 },
    async ({ request, world, expect }) => {
      assert.equal(world.current, currentWorld)

      const response = await request.as('subscriber').get('/issues/first')

      expect(response).toHaveStatus(200)
      expect(response).toHaveJsonPath('actor', 'subscriber')
    }
  )

  assert.deepEqual(baseRegistrations[0].options, {
    concurrency: false,
    timeout: 500,
  })

  await baseRegistrations[0].handler({})
  assert.deepEqual(calls, [
    ['boot', 'trial'],
    ['world:use', 'issue-access', { issue: 'first' }],
    ['request:as', 'subscriber'],
    ['request:get', '/issues/first'],
    ['lower'],
  ])
})

test('test() can opt into concurrent isolated runtime factories', async () => {
  const registrations = []
  const seenRuntimeIds = []
  let nextRuntimeId = 0
  let activeBoots = 0
  let maxActiveBoots = 0

  function createIsolatedRuntime() {
    nextRuntimeId += 1
    const id = nextRuntimeId
    const messages = []

    return {
      __id: id,
      helpers: {},
      world: {
        use: async () => ({}),
      },
      mailbox: {
        capture(message) {
          messages.push(message)
          return message
        },
        all() {
          return [...messages]
        },
        latest() {
          return messages.at(-1)
        },
        clear() {
          messages.length = 0
        },
      },
      request: {
        transport: 'virtual',
      },
      visit: {
        transport: 'virtual',
      },
      sockets: {},
      auth: {
        login: {},
      },
      async boot() {
        activeBoots += 1
        maxActiveBoots = Math.max(maxActiveBoots, activeBoots)
        await delay(20)
        return {
          sails: {
            config: {},
          },
        }
      },
      async lower() {
        activeBoots -= 1
      },
    }
  }

  const baseTest = (title, options, handler) => {
    registrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({
    baseTest,
    runtime: createIsolatedRuntime,
  })

  soundingTest('concurrent explicit option', { concurrent: true }, async ({ sails, mailbox }) => {
    seenRuntimeIds.push(sails.sounding.__id)
    mailbox.capture({ subject: `trial-${sails.sounding.__id}` })
    assert.equal(mailbox.all().length, 1)
  })

  soundingTest.concurrent('concurrent helper alias', async ({ sails, mailbox }) => {
    seenRuntimeIds.push(sails.sounding.__id)
    mailbox.capture({ subject: `trial-${sails.sounding.__id}` })
    assert.equal(mailbox.all().length, 1)
  })

  assert.deepEqual(
    registrations.map((registration) => registration.options),
    [
      {
        concurrency: true,
      },
      {
        concurrency: true,
      },
    ]
  )

  await Promise.all(registrations.map((registration) => registration.handler({})))

  assert.equal(maxActiveBoots, 2)
  assert.deepEqual(seenRuntimeIds.sort(), [1, 2])
})

test('test() rejects concurrent trials backed by one shared runtime object', async () => {
  const registrations = []
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
    visit: {
      transport: 'virtual',
    },
    async boot() {
      return {
        sails: {
          config: {},
        },
      }
    },
    async lower() {},
  }

  const baseTest = (title, options, handler) => {
    registrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({ baseTest, runtime })

  soundingTest('shared runtime cannot run concurrently', { concurrent: true }, async () => {})

  await assert.rejects(
    () => registrations[0].handler({}),
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONCURRENT_RUNTIME_SHARED')
      assert.match(error.message, /isolated runtime state/)
      return true
    }
  )
})

test('test() routes captured mail to the active concurrent runtime mailbox', async () => {
  const registrations = []
  const sends = []
  const send = {
    with(inputs) {
      sends.push(inputs.subject)
      return Promise.resolve({})
    },
  }
  const sails = {
    config: {
      appPath: process.cwd(),
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
      sounding: {
        datastore: 'inherit',
        mail: {
          capture: true,
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

  const baseTest = (title, options, handler) => {
    registrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({
    baseTest,
    runtime: () => createRuntime(sails),
  })

  soundingTest('captures first concurrent message', { concurrent: true }, async ({ sails, mailbox }) => {
    await delay(10)
    await sails.helpers.mail.send.with({
      to: 'first@example.com',
      subject: 'First concurrent message',
    })

    assert.equal(mailbox.latest().subject, 'First concurrent message')
    assert.equal(mailbox.all().length, 1)
  })

  soundingTest('captures second concurrent message', { concurrent: true }, async ({ sails, mailbox }) => {
    await sails.helpers.mail.send.with({
      to: 'second@example.com',
      subject: 'Second concurrent message',
    })

    assert.equal(mailbox.latest().subject, 'Second concurrent message')
    assert.equal(mailbox.all().length, 1)
  })

  await Promise.all(registrations.map((registration) => registration.handler({})))

  assert.deepEqual(sends, [])
  assert.equal(sails.helpers.mail.send, send)
})

test('test() exposes socket helpers for socket-capable trials', async () => {
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
    visit: {
      transport: 'virtual',
    },
    sockets: {
      connect(options) {
        calls.push(['socket:connect', options])
        return Promise.resolve({ connected: true })
      },
      as(actor) {
        calls.push(['socket:as', actor])
        return {
          connect(options) {
            calls.push(['socket:as:connect', options])
            return Promise.resolve({ actor, connected: true })
          },
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
    'chat room accepts websocket members',
    { socket: { timeout: 250 } },
    async ({ sockets }) => {
      const guest = await sockets.connect()
      const member = await sockets.as({ id: 7 }).connect({ path: '/socket.io' })

      assert.equal(guest.connected, true)
      assert.equal(member.actor.id, 7)
    }
  )

  await baseRegistrations[0].handler({})
  assert.deepEqual(calls, [
    ['boot', 'trial'],
    ['socket:connect', { timeout: 250 }],
    ['socket:as', { id: 7 }],
    ['socket:as:connect', { timeout: 250, path: '/socket.io' }],
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
      async use(name, context) {
        calls.push(['world:use', name, context])
        return {}
      },
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
    {
      transport: 'http',
      world: 'focused-dashboard',
      browser: 'desktop',
      timeout: 500,
    },
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
    ['world:use', 'focused-dashboard', {}],
    ['using', 'http'],
    ['visit:using', 'http'],
    ['browser:open', { project: 'desktop', trialName: 'focused http browser trial' }],
    ['lower'],
  ])
})

test('test() appends browser artifact diagnostics to failed browser trials', async () => {
  const calls = []
  const registrations = []
  const artifacts = {
    outputDir: '/tmp/sounding-artifacts',
    directory: '/tmp/sounding-artifacts/dashboard/desktop',
    project: 'desktop',
    trialName: 'dashboard failure keeps browser evidence',
    currentUrl: 'http://127.0.0.1:3333/dashboard',
    currentUrlPath: '/tmp/sounding-artifacts/dashboard/desktop/current-url.txt',
    screenshot: '/tmp/sounding-artifacts/dashboard/desktop/screenshot.png',
    trace: '/tmp/sounding-artifacts/dashboard/desktop/trace.zip',
    video: '/tmp/sounding-artifacts/dashboard/desktop/video.webm',
    errors: [],
  }
  const runtime = {
    helpers: {},
    world: {
      reset() {},
    },
    mailbox: {
      latest: () => null,
    },
    request: {
      transport: 'virtual',
    },
    visit: {
      transport: 'virtual',
    },
    sockets: {},
    browser: {
      async open(options) {
        calls.push(['browser:open', options])

        return {
          browser: { name: 'browser' },
          context: { name: 'context' },
          page: { name: 'page' },
          project: 'desktop',
          async captureFailureArtifacts() {
            calls.push(['browser:captureFailureArtifacts'])
            return artifacts
          },
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
    registrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({ baseTest, runtime })

  soundingTest('dashboard failure keeps browser evidence', { browser: true }, async () => {
    throw new Error('dashboard title was missing')
  })

  await assert.rejects(
    async () => {
      await registrations[0].handler({})
    },
    (error) => {
      assert.match(error.message, /dashboard title was missing/)
      assert.match(error.message, /Sounding browser artifacts:/)
      assert.match(error.message, /http:\/\/127\.0\.0\.1:3333\/dashboard/)
      assert.match(error.message, /screenshot\.png/)
      assert.equal(error.sounding.browserArtifacts, artifacts)
      return true
    }
  )

  assert.deepEqual(calls, [
    ['boot', 'trial'],
    ['browser:open', { trialName: 'dashboard failure keeps browser evidence' }],
    ['browser:captureFailureArtifacts'],
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
      soundingTest('bad concurrency option', { concurrent: 'yes' }, async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.concurrent')
      assert.equal(error.value, 'yes')
      assert.match(error.suggestion, /concurrent: true/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('bad browser', { browser: 42 }, async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.browser')
      assert.equal(error.value, 42)
      assert.match(error.suggestion, /browser: "mobile"/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('empty browser project', { browser: '' }, async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.browser')
      assert.equal(error.value, '')
      assert.match(error.suggestion, /browser: "mobile"/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest(
        'bad browser artifacts',
        { browser: { artifacts: { videos: true } } },
        async () => {}
      )
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.browser.artifacts.videos')
      assert.deepEqual(error.allowed, ['outputDir', 'screenshot', 'trace', 'video', 'currentUrl'])
      assert.match(error.suggestion, /outputDir/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('bad socket', { socket: 'realtime' }, async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.socket')
      assert.equal(error.value, 'realtime')
      assert.match(error.suggestion, /socket: true/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('bad world', { world: true }, async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.world')
      assert.equal(error.value, true)
      assert.match(error.suggestion, /world: "signed-in-user"/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest('bad world name', { world: { name: '' } }, async () => {})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.world.name')
      assert.equal(error.value, '')
      assert.match(error.message, /world.name/)
      return true
    }
  )

  assert.throws(
    () => {
      soundingTest(
        'bad world context',
        { world: { name: 'signed-in-user', context: 'admin' } },
        async () => {}
      )
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_TEST_OPTIONS_INVALID')
      assert.equal(error.path, 'options.world.context')
      assert.equal(error.value, 'admin')
      assert.match(error.message, /world.context/)
      return true
    }
  )

  assert.equal(baseRegistrations.length, 0)
})

test('test() annotates trial failures with auto-loaded world metadata', async () => {
  const baseRegistrations = []
  const runtime = {
    helpers: {},
    world: {
      current: null,
      async use(name) {
        this.current = {
          users: {
            subscriber: {
              id: 42,
            },
          },
        }
        return this.current
      },
    },
    mailbox: {
      latest: () => null,
    },
    request: {
      transport: 'virtual',
    },
    visit: {
      transport: 'virtual',
    },
    async boot() {
      return {
        sails: {
          config: {},
        },
      }
    },
    async lower() {},
  }

  const baseTest = (title, options, handler) => {
    baseRegistrations.push({ title, options, handler })
    return { title }
  }
  baseTest.skip = () => {}
  baseTest.todo = () => {}

  const soundingTest = createTestApi({ baseTest, runtime })

  soundingTest('subscriber cannot read the issue', { world: 'issue-access' }, async () => {
    throw new Error('expected failure')
  })

  await assert.rejects(
    () => baseRegistrations[0].handler({}),
    (error) => {
      assert.equal(error.message, 'expected failure')
      assert.deepEqual(error.sounding, {
        world: {
          name: 'issue-access',
          context: {},
        },
      })
      return true
    }
  )
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
    expect(page).toHaveInertiaProp('plans', [])
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
