// @ts-check

const {
  createExpect,
  createRequestClient,
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

test('trial callback context is typed from JSDoc', async ({ get, expect, request }) => {
  const response = await get('/health')
  expect(response).toHaveStatus(200)

  // @ts-expect-error Trial request clients only support virtual and http transports.
  request.using('ftp')
})
