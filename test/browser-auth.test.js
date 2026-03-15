const test = require('node:test')
const assert = require('node:assert/strict')

const { createBrowserManager } = require('../lib/create-browser-manager')
const { createAuthHelpers } = require('../lib/create-auth-helpers')
const { createExpect } = require('../lib/create-expect')

test('createBrowserManager opens a browser session with the configured base URL', async () => {
  const calls = []
  const fakePage = {
    goto: async (target) => {
      calls.push(['goto', target])
    },
  }

  const manager = createBrowserManager({
    sails: {
      config: {
        appPath: '/tmp/app',
        port: 3333,
        sounding: {
          browser: {
            enabled: true,
            projects: ['desktop'],
            defaultProject: 'desktop',
          },
        },
      },
    },
    getConfig: () => ({
      browser: {
        enabled: true,
        projects: ['desktop'],
        defaultProject: 'desktop',
      },
    }),
    loadPlaywright: async () => ({
      chromium: {
        launch: async (launchOptions) => ({
          launchOptions,
          newContext: async (contextOptions) => ({
            contextOptions,
            newPage: async () => fakePage,
            close: async () => {
              calls.push(['context:close'])
            },
          }),
          close: async () => {
            calls.push(['browser:close'])
          },
        }),
      },
      devices: {},
    }),
    loadPlaywrightTest: async () => ({
      expect(actual) {
        return {
          async toBeVisible() {
            calls.push(['expect', actual])
          },
        }
      },
    }),
  })

  const session = await manager.open()
  assert.equal(session.page, fakePage)
  assert.equal(session.context.contextOptions.baseURL, 'http://127.0.0.1:3333')
  await manager.close()
  assert.deepEqual(calls, [
    ['context:close'],
    ['browser:close'],
  ])
})

test('createAuthHelpers can issue magic links and log a browser page in as an actor', async () => {
  const updates = []
  const page = {
    visits: [],
    async goto(target) {
      this.visits.push(target)
    },
  }

  const sails = {
    helpers: {
      magicLink: {
        generateToken: async () => 'token-123',
        hashToken: async (value) => `hashed:${value}`,
      },
      user: {
        signupWithTeam: {
          with: async (inputs) => ({
            user: {
              id: 1,
              email: inputs.email,
              fullName: inputs.fullName,
            },
            team: {
              id: 1,
              name: `${inputs.fullName}'s Team`,
            },
          }),
        },
      },
    },
    models: {
      user: {
        async findOne(criteria) {
          if (criteria.email === 'reader@example.com' || criteria.id === 1) {
            return {
              id: 1,
              email: 'reader@example.com',
              fullName: 'Reader Example',
            }
          }

          return null
        },
        updateOne(criteria) {
          return {
            set(values) {
              updates.push([criteria, values])
              return Promise.resolve(values)
            },
          }
        },
      },
    },
  }

  const auth = createAuthHelpers({
    sails,
    world: {
      current: {
        users: {
          reader: {
            id: 1,
            email: 'reader@example.com',
          },
        },
      },
    },
    mailbox: {
      latest() {
        return null
      },
    },
    request: {
      post: async () => ({ status: 302, header: () => '/check-email' }),
    },
  })

  const issued = await auth.issueMagicLink('reader')
  assert.equal(issued.url, '/magic-link/token-123')
  assert.equal(updates[0][1].magicLinkToken, 'hashed:token-123')

  await auth.login.as('reader', page)
  assert.deepEqual(page.visits, ['/magic-link/token-123'])
})

test('createExpect can fall back to Playwright expect for browser objects', async () => {
  const calls = []
  const browserExpect = (actual) => ({
    async toBeVisible() {
      calls.push(actual)
    },
  })

  await createExpect.withFallback(browserExpect)({ locator: true }).toBeVisible()
  assert.deepEqual(calls, [{ locator: true }])
})
