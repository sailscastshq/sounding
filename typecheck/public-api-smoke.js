// @ts-check

const sounding = require('../index')

const {
  createAppManager,
  createAuthHelpers,
  createBrowserManager,
  createExpect,
  createHelperRunner,
  createMailbox,
  createMailCapture,
  createRequestClient,
  createSocketManager,
  createTestApi,
  createVisitClient,
  createWorldEngine,
  createRuntime,
  defineFactory,
  defineScenario,
  getDefaultConfig,
  loadWorldFiles,
  test,
} = sounding

const defaultConfig = getDefaultConfig()
defaultConfig.request.transport = 'http'
// @ts-expect-error Sounding config only supports virtual and http transports.
defaultConfig.request.transport = 'ftp'
defaultConfig.request.transport = 'virtual'

const fakePage = {
  goto() {},
  fill() {},
  click() {},
}

const fakeSails = {
  config: {
    appPath: process.cwd(),
    environment: 'test',
    sounding: defaultConfig,
  },
  router: {
    route() {},
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
    sockets: {},
  },
  io: {},
  sockets: {},
  helpers: {
    user: {
      signupWithTeam: {
        with(inputs) {
          return Promise.resolve({
            user: {
              id: 1,
              email: inputs.email,
              fullName: inputs.fullName,
            },
          })
        },
      },
    },
    magicLink: {
      generateToken() {
        return 'token'
      },
      hashToken(token) {
        return `hashed-${token}`
      },
    },
    mail: {
      send: {
        with() {
          return Promise.resolve({})
        },
      },
    },
  },
  models: {
    user: {
      findOne(criteria) {
        return Promise.resolve({
          id: criteria.id || 1,
          email: criteria.email || 'owner@example.com',
        })
      },
      updateOne() {
        return {
          set() {
            return Promise.resolve({})
          },
        }
      },
    },
  },
  request() {},
  renderView() {
    return Promise.resolve('<a href="https://example.com/welcome">Welcome</a>')
  },
}

const hook = sounding(fakeSails)
hook.configure()
hook.initialize((error) => {
  if (error) {
    throw error
  }
})

const mailbox = createMailbox()
const captured = mailbox.capture({
  to: 'reader@example.com',
  subject: 'Welcome',
  ctaUrl: 'https://example.com/welcome',
})
createExpect(mailbox).toHaveSentCount(1)
createExpect(mailbox.latest()).toHaveCtaUrl(/welcome/)
captured.subject?.toUpperCase()

const mailCapture = createMailCapture({
  sails: fakeSails,
  mailbox,
  getConfig: () => defaultConfig,
})
mailCapture.install()
if (mailCapture.installed) {
  mailCapture.uninstall()
}

const helper = createHelperRunner({ sails: fakeSails })
helper('user.signupWithTeam', {
  email: 'reader@example.com',
}).then((result) => result)

const request = createRequestClient({
  sails: fakeSails,
  getConfig: () => defaultConfig,
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

const runtime = createRuntime(fakeSails)
runtime.configure()
runtime.cacheStats.config.resolutions.toFixed()
runtime.cacheStats.worldLoader.moduleLoads.toFixed()
runtime.invalidateCaches()
runtime.request.using('virtual').get('/runtime-health')
runtime.boot({ mode: 'trial' }).then((booted) => {
  booted.request.using('http')
  booted.login.withPassword('owner@example.com', fakePage, {
    password: 'secret123',
  })
})

const appManager = createAppManager({
  appPath: process.cwd(),
  environment: 'test',
  liftOptions: {
    port: 0,
  },
})
appManager.resolveConfig().request.transport = 'virtual'
appManager.runtime({ app: 'load', reload: true }).then((activeRuntime) => {
  activeRuntime.request.using('virtual')
})
appManager.runtime({ transport: 'http' }).then((activeRuntime) => {
  activeRuntime.request.using('http')
})
appManager.lifecycle.load.status.toUpperCase()
appManager.lifecycle.lift.durationMs?.toFixed()

const worldEngine = createWorldEngine({ sails: fakeSails })
const userFactory = defineFactory('member', ({ sequence }) => ({
  email: sequence('member-email', (next) => `member-${next}@example.com`),
  role: 'member',
})).trait('admin', {
  role: 'admin',
})
const signedInScenario = defineScenario('signed-in-member', async ({ create, context }) => ({
  users: {
    member: await create('member').trait(context.role || 'admin'),
  },
}))

worldEngine.register(userFactory)
worldEngine.register(signedInScenario)
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
  sails: fakeSails,
  getConfig: () => defaultConfig,
  world: worldEngine,
})

sockets.connect({ timeout: 100 }).then(async (socket) => {
  await socket.post('/rooms/join', { room: 'lobby' })
  await createExpect(socket).toReceive('chat:message', { room: 'lobby' })
})

const browser = createBrowserManager({
  sails: fakeSails,
  getConfig: () => defaultConfig,
})
browser.open({ project: 'desktop', artifacts: false }).then(async (session) => {
  await session.captureFailureArtifacts()
})

const auth = createAuthHelpers({
  sails: fakeSails,
  world: worldEngine,
  mailbox,
  request,
})
auth.resolveActor('owner@example.com').then((actor) => actor.email)
auth.request
  .withPassword('owner@example.com', {
    password: 'secret123',
    request,
  })
  .then((result) => result.response)
auth.login
  .withPassword('owner@example.com', fakePage, {
    password: 'secret123',
  })
  .then((result) => result.actor)

loadWorldFiles({
  world: worldEngine,
  appPath: process.cwd(),
  config: defaultConfig,
  sails: fakeSails,
}).then((loadedFiles) => loadedFiles.map((filePath) => filePath.toUpperCase()))

const localTest = createTestApi({ runtime: () => runtime })
localTest('typed trial', async ({ get, expect }) => {
  const response = await get('/health')
  expect(response).toHaveStatus(200)
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

test.concurrent('concurrent trial options are typed from JSDoc', { concurrent: true }, async () => {})

test('browser page wrapper context is typed from JSDoc', { browser: 'mobile' }, async ({ visit, page, expect, smoke }) => {
  const visitedPage = await visit('/dashboard').inDarkMode()

  await visitedPage
    .click('@send-link')
    .type('email', 'owner@example.com')
    .typeSlowly('@search', 'billing')
    .append('@email', '.test')
    .clear('@search')
    .attach('@avatar', 'avatar.png')
    .drag('@card', '@dropzone')
    .press('Send link')
    .resize(390, 844)
    .key('Enter')
    .keys(['Meta+K', 'Escape'])
    .withinFrame('@checkout-frame', async (frame) => {
      await frame.click('Save')
    })

  await visit('/settings')
    .on('safari')
    .withHost('app.test')
    .inLightMode()
    .withLocale('en-GB')
    .withTimezone('Africa/Lagos')
    .withUserAgent('SoundingBot/1.0')
    .withGeolocation(6.5244, 3.3792)
    .click('@profile')

  await visit('/nearby').withGeolocation({
    latitude: 6.5244,
    longitude: 3.3792,
    accuracy: 20,
  })

  await visit('/mobile-dashboard').onMobile()

  const smokePages = await smoke(['/', '/pricing'], { project: 'mobile' })
  expect(smokePages).toHaveNoSmoke()
  smokePages.entries[0].target
  smokePages.entries[0].currentUrl
  smokePages.entries[0].project
  smokePages.pages[0].raw

  const visitedPages = await visit.all(['/contact', '/about'])
  expect(visitedPages).toHaveNoSmoke()

  await expect(visitedPage).toSee('Dashboard')
  await expect(visitedPage).not.toSee('Forbidden')
  expect(visitedPage).toHavePath('/dashboard')
  await expect(visitedPage).toHaveTitle(/Dashboard/)
  expect(visitedPage).toHaveNoJavascriptErrors()
  expect(visitedPage).toHaveNoConsoleLogs()
  expect(visitedPage).toHaveNoConsoleErrors()
  expect(visitedPage).toHaveNoSmoke()
  await expect(visitedPage).toMatchScreenshot('dashboard-mobile')
  await expect(visitedPage).toMatchScreenshot('dashboard-mobile-dark', { fullPage: true })

  visitedPage.url()
  await visitedPage.text('@status')
  await visitedPage.html()
  await visitedPage.content()
  await visitedPage.script(() => 'ok')
  await visitedPage.screenshot('dashboard.png', { fullPage: true })
  await visitedPage.screenshotElement('@receipt', 'receipt.png')

  page?.raw
})

// @ts-expect-error Trial options only support virtual and http transports.
test('invalid transport options are caught by public JSDoc', { transport: 'ftp' }, async () => {})

// @ts-expect-error Factory definitions must be an object or factory callback.
defineFactory('broken-factory', 123)
