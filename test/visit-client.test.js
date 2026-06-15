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
            request: {
              method: 'GET',
              target,
              transport: 'virtual',
              headers: options.headers || {},
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
  createExpect(page).toHaveInertiaError('fullName', 'Full name is required.')
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

test('createVisitClient can scope visits to actor aliases', async () => {
  const calls = []
  const request = {
    transport: 'virtual',
    as(actor) {
      calls.push(['as', actor])
      return this
    },
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
              props: {},
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
  const page = await visit.as('owner')('/dashboard')

  createExpect(page).toBeInertiaPage('dashboard/index')
  assert.deepEqual(calls, [
    ['withHeaders', DEFAULT_HEADERS],
    ['as', 'owner'],
    ['withHeaders', DEFAULT_HEADERS],
    ['get', '/dashboard', {}],
  ])
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
            request: {
              method: 'GET',
              target,
              transport: 'virtual',
              headers: options.headers || {},
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
  createExpect(page).toHaveInertiaPartialReload({
    component: 'dashboard/index',
    only: ['notifications'],
    reset: ['sidebar'],
    version: 'v1',
  })
  createExpect(page).toHaveOnlyInertiaProps(['notifications'])
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

test('createExpect supports first-class Inertia page contract matchers', () => {
  const page = {
    status: 200,
    data: {
      component: 'dashboard/index',
      props: {
        auth: {
          user: {
            email: 'ada@example.com',
            fullName: 'Ada Lovelace',
          },
        },
        projects: [
          { id: 1, name: 'Analytical Engine' },
          { id: 2, name: 'Difference Engine' },
        ],
        stats: {
          projects: 2,
        },
        shared: {
          featureFlags: {
            billing: true,
          },
        },
        errors: {
          email: 'Email is required.',
          password: ['Password is too short.'],
        },
      },
    },
    request: {
      method: 'GET',
      target: '/dashboard',
      transport: 'virtual',
      headers: {
        'x-inertia-partial-component': 'dashboard/index',
        'x-inertia-partial-data': 'projects,stats',
        'x-inertia-reset': 'sidebar',
      },
    },
    header: () => null,
  }
  const expectPage = createExpect(page)

  expectPage.toBeInertiaPage('dashboard/index')
  expectPage.toHaveInertiaProp('auth.user.email', 'ada@example.com')
  expectPage.toHaveInertiaProp('auth.user', { email: 'ada@example.com' })
  expectPage.toHaveInertiaProps({
    'stats.projects': 2,
    projects: [{ id: 1 }],
  })
  expectPage.toMatchInertiaProp('auth.user.fullName', /Ada/)
  expectPage.toHaveInertiaPropCount('projects', 2)
  expectPage.toHaveSharedInertiaProp('featureFlags.billing', true)
  expectPage.toHaveInertiaError('email', /required/)
  expectPage.toHaveInertiaErrors(['email', 'password'])
  expectPage.toHaveInertiaErrors({
    email: /required/,
    password: ['Password is too short.'],
  })
  expectPage.toHaveInertiaPartialReload({
    component: 'dashboard/index',
    only: ['projects', 'stats'],
    reset: ['sidebar'],
  })
  expectPage.not.toHaveInertiaProp('auth.user.ssn')
  expectPage.not.toHaveSharedInertiaProp('featureFlags.experimental')
  expectPage.not.toHaveInertiaError('fullName')

  assert.throws(
    () => expectPage.toHaveInertiaProp('missing'),
    /Expected Inertia prop `missing` to be present/
  )
})

test('createExpect can assert empty Inertia validation errors', () => {
  createExpect({
    data: {
      component: 'dashboard/index',
      props: {
        errors: {},
      },
    },
  }).toHaveNoInertiaErrors()
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
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_VISIT_COMPONENT_REQUIRED')
      assert.equal(error.partialReload, 'only')
      assert.match(error.message, /requires `component` when using `only`/)
      return true
    }
  )
})
