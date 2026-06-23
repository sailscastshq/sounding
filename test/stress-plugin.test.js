const test = require('node:test')
const assert = require('node:assert/strict')

const { createPluginApi } = require('../lib/create-plugin-manager')
const { createStressClient } = require('../plugins/stress')
const { parseStressArgs } = require('../plugins/stress/lib/command')

test('stress client maps Sounding stress options to the load engine and normalizes results', async () => {
  const calls = []
  const api = createPluginApi()
  const stress = createStressClient({
    api,
    runEngine: async (options) => {
      calls.push(options)
      return {
        duration: 5,
        connections: 2,
        requests: {
          total: 20,
          average: 4,
        },
        latency: {
          min: 2,
          p50: 8,
          p95: 16,
          max: 30,
        },
        throughput: {
          total: 400,
          average: 80,
        },
        errors: 0,
        timeouts: 0,
        non2xx: 0,
      }
    },
  })

  const result = await stress
    .post('https://example.com/api/invoices', { plan: 'pro' })
    .headers({ authorization: 'Bearer test-token' })
    .concurrently(2)
    .for(5)
    .seconds()

  assert.deepEqual(calls, [
    {
      url: 'https://example.com/api/invoices',
      method: 'POST',
      connections: 2,
      duration: 5,
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ plan: 'pro' }),
    },
  ])
  assert.equal(result.requests.count(), 20)
  assert.equal(result.requests.rate(), 4)
  assert.equal(result.requests.failed().count(), 0)
  assert.equal(result.requests.duration().med(), 8)
  assert.equal(result.requests.duration().p95(), 16)
  assert.equal(result.requests.download().data().count(), 400)
  assert.equal(result.testRun.concurrency(), 2)
  assert.equal(result.testRun.duration(), 5)
})

test('stress client can create a real Sails session cookie for world actors', async () => {
  const calls = []
  const sessionWrites = []
  const api = createPluginApi()
  const sails = {
    config: {
      port: 1337,
      sounding: {},
    },
    session: {
      generateNewSidCookie() {
        return 'sails.sid=signed-session'
      },
      parseSessionIdFromCookie(cookie) {
        assert.equal(cookie, 'sails.sid=signed-session')
        return 'session-id'
      },
      set(sid, value, done) {
        sessionWrites.push([sid, value])
        done()
      },
    },
  }
  const world = {
    current: {
      users: {
        owner: {
          id: 7,
          teamId: 3,
          headers: {
            'x-actor': 'owner',
          },
        },
      },
    },
  }
  const stress = createStressClient({
    api,
    sails,
    getConfig: () => ({}),
    world,
    runEngine: async (options) => {
      calls.push(options)
      return {
        duration: 1,
        connections: 1,
        requests: {
          total: 1,
          average: 1,
        },
        latency: {
          p50: 1,
          p95: 1,
          max: 1,
        },
      }
    },
  })

  await stress.get('/dashboard').as('owner').run()

  assert.equal(calls[0].url, 'http://127.0.0.1:1337/dashboard')
  assert.deepEqual(calls[0].headers, {
    'x-actor': 'owner',
    cookie: 'sails.sid=signed-session',
  })
  assert.deepEqual(sessionWrites, [
    [
      'session-id',
      {
        cookie: {
          httpOnly: true,
          path: '/',
        },
        userId: 7,
        teamId: 3,
      },
    ],
  ])
})

test('parseStressArgs supports external URLs, local worlds, method flags, and headers', () => {
  assert.deepEqual(
    parseStressArgs([
      '/api/billing/summary',
      '--world=subscribed-creator',
      '--as',
      'owner',
      '--duration=10',
      '--concurrency',
      '20',
      '--post={"plan":"pro"}',
      '--header',
      'x-test-lane: stress',
    ]),
    {
      target: '/api/billing/summary',
      world: 'subscribed-creator',
      actor: 'owner',
      duration: 10,
      concurrency: 20,
      method: 'POST',
      payload: {
        plan: 'pro',
      },
      headers: {
        'content-type': 'application/json',
        'x-test-lane': 'stress',
      },
    }
  )
})
