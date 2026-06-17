const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const path = require('node:path')

const { createAppManager } = require('../lib/create-app-manager')
const { createTestApi } = require('../lib/create-test-api')

const fixtureAppPath = path.join(__dirname, 'fixtures', 'sails-app')

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(address.port)
      })
    })
  })
}

test('createAppManager exercises a real Sails fixture app through the Sounding runtime', async (t) => {
  const manager = createAppManager({
    appPath: fixtureAppPath,
  })

  t.after(async () => {
    await manager.lower()
  })

  const runtime = await manager.runtime()
  const booted = await runtime.boot({ mode: 'integration' })

  assert.equal(booted.sails.config.appPath, fixtureAppPath)
  assert.equal(booted.sails.sounding, runtime)
  assert.equal(booted.datastore.identity, 'default')
  assert.match(booted.datastore.config.url, /\.tmp\/sounding-fixture-db\/default\/worker-\d+\.db$/)

  const health = await booted.request.get('/api/health')
  assert.equal(health.status, 200)
  assert.deepEqual(health.data, {
    ok: true,
    environment: 'test',
    hookEnabled: true,
  })

  const login = await booted.request.post('/login', {
    email: 'ada@example.com',
  })
  assert.equal(login.status, 302)
  assert.equal(login.header('location'), '/dashboard')
  assert.deepEqual(login.session.user, {
    email: 'ada@example.com',
  })
  assert.deepEqual(login.session.__soundingFlashStore.info, ['Welcome ada@example.com'])

  const me = await booted.request.get('/me')
  assert.equal(me.status, 200)
  assert.deepEqual(me.data, {
    email: 'ada@example.com',
    flashes: ['Welcome ada@example.com'],
  })

  const drainedFlash = await booted.request.get('/me')
  assert.deepEqual(drainedFlash.data.flashes, [])

  const created = await booted.request.post('/api/users', {
    email: 'grace@example.com',
    fullName: 'Grace Hopper',
  })
  assert.equal(created.status, 201)
  assert.equal(created.data.email, 'grace@example.com')

  assert.deepEqual(booted.world.factories, ['user'])
  assert.deepEqual(booted.world.scenarios, ['signed-in-user'])

  const built = booted.world.build('user')
  assert.equal(built.email, 'fixture-user-1@example.com')

  const world = await booted.world.use('signed-in-user')
  assert.equal(world.users.member.fullName, 'Fixture Admin')

  const actorResponse = await booted.request.as(world.users.member).get('/me')
  assert.equal(actorResponse.status, 200)
  assert.equal(actorResponse.data.email, world.users.member.email)

  const aliasResponse = await booted.request.as('member').get('/me')
  assert.equal(aliasResponse.status, 200)
  assert.equal(aliasResponse.data.email, world.users.member.email)

  const helperResult = await booted.helpers.sendWelcomeEmail({
    email: 'ada@example.com',
  })
  assert.deepEqual(helperResult, {
    queued: true,
    email: 'ada@example.com',
  })
  assert.equal(booted.mailbox.latest().subject, 'Welcome to the fixture')
  assert.deepEqual(booted.mailbox.latest().to, ['ada@example.com'])

  await runtime.lower()
  assert.equal(booted.mailbox.all().length, 0)
})

test('createAppManager can lift the real fixture app for HTTP request trials', async (t) => {
  const port = await getFreePort()
  const manager = createAppManager({
    appPath: fixtureAppPath,
    liftOptions: {
      port,
    },
  })

  t.after(async () => {
    await manager.lower()
  })

  const runtime = await manager.runtime({ app: 'lift' })
  const booted = await runtime.boot({ mode: 'http' })

  const health = await booted.request.using('http').get('/api/health')
  assert.equal(health.status, 200)
  assert.equal(health.data.ok, true)
  assert.equal(health.session, undefined)

  await runtime.lower()
})

test('test() auto-loads fixture worlds before request trials', async (t) => {
  const manager = createAppManager({
    appPath: fixtureAppPath,
  })
  const registrations = []

  t.after(async () => {
    await manager.lower()
  })

  const runtime = await manager.runtime()
  const soundingTest = createTestApi({
    runtime,
    baseTest(title, options, handler) {
      registrations.push({ title, options, handler })
      return { title }
    },
  })

  soundingTest(
    'member can inspect the current profile',
    { world: 'signed-in-user' },
    async ({ request, world, expect }) => {
      const response = await request.as('member').get('/me')

      expect(response).toHaveStatus(200)
      expect(response).toHaveJsonPath('email', world.current.users.member.email)
    }
  )

  assert.deepEqual(registrations[0].options, {
    concurrency: false,
  })

  await registrations[0].handler({})
})
