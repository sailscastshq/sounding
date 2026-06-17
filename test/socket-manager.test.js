const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const path = require('node:path')

const { createAppManager } = require('../lib/create-app-manager')
const { createExpect } = require('../lib/create-expect')

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

test('createSocketManager exercises Sails socket requests and room broadcasts', async (t) => {
  const port = await getFreePort()
  const manager = createAppManager({
    appPath: fixtureAppPath,
    liftOptions: {
      port,
      hooks: {
        sockets: true,
      },
    },
  })

  t.after(async () => {
    await manager.lower()
  })

  const runtime = await manager.runtime({ app: 'lift' })
  const booted = await runtime.boot({ mode: 'socket' })

  const member = await booted.sockets.connect()
  const speaker = await booted.sockets.connect()

  const health = await member.get('/api/socket-health')
  assert.equal(health.status, 200)
  assert.deepEqual(health.request, {
    method: 'GET',
    target: '/api/socket-health',
    transport: 'socket',
    url: '/api/socket-health',
  })
  assert.equal(health.data.ok, true)
  assert.equal(health.data.isSocket, true)
  assert.equal(health.data.socketId, member.id)

  const firstSessionWrite = await member.post('/api/socket-session', {
    marker: 'member-session',
  })
  assert.equal(firstSessionWrite.status, 200)

  const memberSession = await member.get('/api/socket-session')
  assert.equal(memberSession.data.marker, 'member-session')

  const speakerSession = await speaker.get('/api/socket-session')
  assert.equal(speakerSession.data.marker, null)

  const current = await booted.world.use('signed-in-user')
  const actorSocket = await booted.sockets.as(current.users.member).connect()
  const actorMe = await actorSocket.get('/dashboard')
  assert.equal(actorMe.status, 200)
  assert.equal(actorMe.data.email, current.users.member.email)

  const actorSocketFromAlias = await booted.sockets.as('member').connect()
  const aliasMe = await actorSocketFromAlias.get('/dashboard')
  assert.equal(aliasMe.status, 200)
  assert.equal(aliasMe.data.email, current.users.member.email)

  const join = await member.post('/api/socket-rooms/join', {
    room: 'arena',
  })
  assert.equal(join.status, 200)
  assert.deepEqual(join.data, {
    joined: true,
    room: 'arena',
    socketId: member.id,
  })

  const nextMessage = createExpect(member).toReceive('chat:message', {
    room: 'arena',
    text: 'ready',
  })
  const sent = await speaker.post('/api/socket-rooms/message', {
    room: 'arena',
    text: 'ready',
  })

  assert.equal(sent.status, 200)
  await nextMessage

  const secondMessage = member.receive('chat:message')
  await speaker.post('/api/socket-rooms/message', {
    room: 'arena',
    text: 'second',
  })
  const payload = await secondMessage
  assert.equal(payload.text, 'second')

  await runtime.lower()
  assert.equal(member.connected, false)
  assert.equal(speaker.connected, false)
  assert.equal(actorSocket.connected, false)
  assert.equal(actorSocketFromAlias.connected, false)
})
