// @ts-check

const {
  createExpect,
  createRequestClient,
  createSocketManager,
  createVisitClient,
  test,
} = require('../index')

const request = createRequestClient({
  sails: {
    config: {
      sounding: {},
    },
    router: {
      route() {},
    },
  },
})

request
  .as({ id: 1, teamId: 2 })
  .withHeaders({ accept: 'application/json' })
  .using('virtual')
  .get('/account')
  .then((response) => {
    createExpect(response).toHaveStatus(200)
    return response.json()
  })

// @ts-expect-error Sounding only supports virtual and http transports.
request.using('ftp')

const visit = createVisitClient({ request })
visit('/dashboard', {
  component: 'dashboard/index',
  only: ['notifications'],
})

const sockets = createSocketManager({
  sails: {
    config: {
      sounding: {},
    },
    hooks: {
      http: {
        server: {
          address() {
            return {
              address: '127.0.0.1',
              port: 1337,
            }
          },
        },
      },
    },
  },
})

sockets.connect({ timeout: 100 }).then(async (socket) => {
  await socket.post('/rooms/join', { room: 'lobby' })
  await createExpect(socket).toReceive('chat:message', { room: 'lobby' })
})

test('trial callback context is typed from JSDoc', async ({ get, expect, request, sockets }) => {
  const response = await get('/health')
  expect(response).toHaveStatus(200)

  const socket = await sockets.connect({ timeout: 100 })
  await expect(socket).toReceive('chat:message', { text: 'hello' }, { timeout: 100 })

  // @ts-expect-error Trial request clients only support virtual and http transports.
  request.using('ftp')
})

test(
  'world-backed trial context is typed from JSDoc',
  { world: { name: 'signed-in-user', context: { role: 'member' } } },
  async ({ request, world, expect }) => {
    const response = await request.as('member').get('/me')

    expect(response).toHaveStatus(200)
    expect(response).toHaveJsonPath('email', world.current.users.member.email)
  }
)

test('world string options are typed from JSDoc', { world: 'signed-in-user' }, async () => {})
