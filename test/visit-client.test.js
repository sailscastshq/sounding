const test = require('node:test')
const assert = require('node:assert/strict')

const { createVisitClient, DEFAULT_HEADERS } = require('../lib/create-visit-client')
const { createExpect } = require('../lib/create-expect')

test('createVisitClient defaults to a GET visit with Inertia headers', async () => {
  const calls = []
  const request = {
    transport: 'virtual',
    withHeaders(headers) {
      calls.push(['withHeaders', headers])
      return {
        transport: 'virtual',
        get: async (target, options = {}) => {
          calls.push(['get', target, options])
          return {
            status: 200,
            data: {
              component: 'billing/pricing',
              props: { plans: [] },
            },
            header: () => null,
          }
        },
        head: async () => null,
        post: async () => null,
        put: async () => null,
        patch: async () => null,
        delete: async () => null,
        using() {
          throw new Error('not needed in this test')
        },
      }
    },
  }

  const visit = createVisitClient({ request })
  const page = await visit('/pricing')

  assert.equal(visit.transport, 'virtual')
  assert.deepEqual(calls[0], ['withHeaders', DEFAULT_HEADERS])
  assert.deepEqual(calls[1], ['get', '/pricing', {}])
  createExpect(page).toBeInertiaPage('billing/pricing')
})

test('createVisitClient exposes post and transport scoping', async () => {
  const calls = []
  const request = {
    transport: 'virtual',
    withHeaders(headers) {
      calls.push(['withHeaders', headers])
      return {
        transport: 'virtual',
        get: async () => null,
        head: async () => null,
        post: async (target, payload, options = {}) => {
          calls.push(['post', target, payload, options])
          return {
            status: 200,
            data: {
              component: 'auth/signup',
              props: {
                errors: {
                  fullName: 'Full name is required.',
                },
              },
            },
            header: () => null,
          }
        },
        put: async () => null,
        patch: async () => null,
        delete: async () => null,
      }
    },
    using(transport) {
      calls.push(['using', transport])
      return {
        withHeaders(nextHeaders) {
          calls.push(['withHeaders:scoped', nextHeaders])
          return {
            transport,
            get: async () => null,
            head: async () => null,
            post: async () => ({ status: 200, data: { component: 'scoped', props: {} }, header: () => null }),
            put: async () => null,
            patch: async () => null,
            delete: async () => null,
          }
        },
      }
    },
  }

  const visit = createVisitClient({ request })
  const page = await visit.post('/signup', {
    fullName: '',
    emailAddress: 'not-an-email',
  })
  const httpVisit = visit.using('http')

  createExpect(page).toBeInertiaPage('auth/signup')
  createExpect(page).toHaveValidationError('fullName', 'Full name is required.')
  assert.equal(httpVisit.transport, 'http')
  assert.deepEqual(calls[0], ['withHeaders', DEFAULT_HEADERS])
  assert.deepEqual(calls[1], [
    'post',
    '/signup',
    {
      fullName: '',
      emailAddress: 'not-an-email',
    },
    {},
  ])
  assert.deepEqual(calls[2], ['using', 'http'])
  assert.deepEqual(calls[3], ['withHeaders:scoped', DEFAULT_HEADERS])
})


test('createVisitClient can express partial reload headers cleanly', async () => {
  const calls = []
  const request = {
    transport: 'virtual',
    withHeaders(headers) {
      calls.push(['withHeaders', headers])
      return {
        transport: 'virtual',
        get: async (target, options = {}) => {
          calls.push(['get', target, options])
          return {
            status: 200,
            data: {
              component: 'dashboard/index',
              props: {
                notifications: [],
              },
            },
            header: () => null,
          }
        },
        head: async () => null,
        post: async () => null,
        put: async () => null,
        patch: async () => null,
        delete: async () => null,
      }
    },
  }

  const visit = createVisitClient({ request })
  const page = await visit('/dashboard', {
    component: 'dashboard/index',
    only: ['notifications'],
    reset: ['sidebar'],
    version: 'v1',
  })

  createExpect(page).toBeInertiaPage('dashboard/index')
  assert.deepEqual(calls[1], [
    'get',
    '/dashboard',
    {
      headers: {
        'x-inertia-partial-component': 'dashboard/index',
        'x-inertia-partial-data': 'notifications',
        'x-inertia-reset': 'sidebar',
        'x-inertia-version': 'v1',
      },
    },
  ])
})

test('createVisitClient requires a component for partial reload selectors', async () => {
  const request = {
    transport: 'virtual',
    withHeaders() {
      return {
        transport: 'virtual',
        get: async () => null,
        head: async () => null,
        post: async () => null,
        put: async () => null,
        patch: async () => null,
        delete: async () => null,
      }
    },
  }

  const visit = createVisitClient({ request })

  await assert.rejects(
    async () => {
      await visit('/dashboard', { only: ['notifications'] })
    },
    /requires `component` when using `only`/
  )
})
