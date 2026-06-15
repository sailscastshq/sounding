// @ts-check

const {
  createExpect,
  createRequestClient,
  createWorldEngine,
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
}).then((page) => {
  createExpect(page).toBeInertiaPage('dashboard/index')
  createExpect(page).toHaveInertiaProp('notifications')
  createExpect(page).toHaveInertiaProps({ notifications: [] })
  createExpect(page).toHaveInertiaPropCount('notifications', 0)
  createExpect(page).toHaveOnlyInertiaProps(['notifications'])
  createExpect(page).toHaveNoInertiaErrors()
  createExpect(page).toHaveInertiaPartialReload({
    component: 'dashboard/index',
    only: ['notifications'],
  })
})

const worldEngine = createWorldEngine({ sails: { models: {} } })
worldEngine.defineFactory('user', {
  email: 'reader@example.com',
  role: 'reader',
}).trait('admin', {
  role: 'admin',
})

worldEngine
  .create('user')
  .trait('admin')
  .with({ email: 'admin@example.com' })
  .withOnly({ fullName: 'Admin Example' })
  .then((user) => user)

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
