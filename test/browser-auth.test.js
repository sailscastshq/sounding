const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { createBrowserManager } = require('../lib/create-browser-manager')
const { createAuthHelpers } = require('../lib/create-auth-helpers')
const { createExpect } = require('../lib/create-expect')
const { createSoundingBrowserPage } = require('../lib/create-browser-page')

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
  assert.equal(session.page.raw, fakePage)
  assert.equal(session.page.playwrightPage, fakePage)
  assert.equal(session.context.contextOptions.baseURL, 'http://127.0.0.1:3333')
  await manager.close()
  assert.deepEqual(calls, [
    ['context:close'],
    ['browser:close'],
  ])
})

test('createBrowserManager returns a Sounding page wrapper with raw Playwright escape hatches', async () => {
  const calls = []
  const handlers = {}
  let currentUrl = 'http://127.0.0.1:3333/sign-in'
  const fakePage = {
    on(event, handler) {
      handlers[event] = handler
    },
    url: () => currentUrl,
    title: async () => 'Welcome back',
    async goto(target) {
      currentUrl = `http://127.0.0.1:3333${target}`
      calls.push(['goto', target])
    },
    getByText(text) {
      return {
        first() {
          return this
        },
        async click() {
          calls.push(['text:click', text])
        },
      }
    },
    getByLabel(label) {
      return {
        first() {
          return this
        },
        async fill(value) {
          calls.push(['label:fill', label, value])
        },
      }
    },
    locator(selector) {
      return {
        async textContent() {
          assert.equal(selector, 'body')
          return 'Sign In Check your email'
        },
      }
    },
    async emulateMedia(options) {
      calls.push(['emulateMedia', options])
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
        launch: async () => ({
          newContext: async () => ({
            newPage: async () => fakePage,
            close: async () => {},
          }),
          close: async () => {},
        }),
      },
      devices: {},
    }),
    loadPlaywrightTest: async () => null,
  })

  const session = await manager.open()
  const page = session.page

  await page.goto('/sign-in').inDarkMode()
  await page.click('Email me a link').type('email', 'creator@example.com').press('Send link')
  await createExpect(page).toSee('Check your email')
  await createExpect(page).not.toSee('Forbidden')
  createExpect(page).toHavePath('/sign-in')
  await createExpect(page).toHaveTitle(/Welcome/)

  handlers.console({ type: () => 'error', text: () => 'ReferenceError: boom' })
  assert.throws(() => createExpect(page).toHaveNoSmoke(), /ReferenceError: boom/)
  handlers.pageerror(new Error('hydration failed'))
  assert.throws(() => createExpect(page).toHaveNoJavascriptErrors(), /hydration failed/)

  assert.equal(page.raw, fakePage)
  assert.deepEqual(calls, [
    ['goto', '/sign-in'],
    ['emulateMedia', { colorScheme: 'dark' }],
    ['text:click', 'Email me a link'],
    ['label:fill', 'email', 'creator@example.com'],
    ['text:click', 'Send link'],
  ])
})

test('createSoundingBrowserPage supports human browser affordances inspired by Pest', async () => {
  const calls = []
  const currentUrl = 'http://127.0.0.1:3333/dashboard'
  const selectorFor = (selector) => ({
    __selector: selector,
    async textContent() {
      calls.push(['locator:textContent', selector])
      return selector === 'body' ? 'Dashboard Ready' : `Text for ${selector}`
    },
    async screenshot(options) {
      calls.push(['locator:screenshot', selector, options])
      return Buffer.from('fake-element-shot')
    },
    async scrollIntoViewIfNeeded() {
      calls.push(['locator:scroll', selector])
    },
    async click(options) {
      calls.push(['locator:click', selector, options])
    },
    async fill(value, options) {
      calls.push(['locator:fill', selector, value, options])
    },
    async waitFor(options) {
      calls.push(['locator:waitFor', selector, options])
    },
  })
  const fakePage = {
    on() {},
    url: () => currentUrl,
    locator: (selector) => selectorFor(selector),
    getByText(text) {
      return {
        first() {
          return this
        },
        async click(options) {
          calls.push(['text:click', text, options])
        },
      }
    },
    getByLabel(label) {
      return {
        first() {
          return this
        },
        async fill(value, options) {
          calls.push(['label:fill', label, value, options])
        },
        async inputValue() {
          calls.push(['label:inputValue', label])
          return 'typed-'
        },
        async pressSequentially(value, options) {
          calls.push(['label:pressSequentially', label, value, options])
        },
      }
    },
    async click(selector, options) {
      calls.push(['click', selector, options])
    },
    async fill(selector, value, options) {
      calls.push(['fill', selector, value, options])
    },
    async inputValue(selector) {
      calls.push(['inputValue', selector])
      return 'saved-'
    },
    async setInputFiles(selector, files, options) {
      calls.push(['setInputFiles', selector, files, options])
    },
    async dragAndDrop(source, target, options) {
      calls.push(['dragAndDrop', source, target, options])
    },
    async waitForSelector(selector, options) {
      calls.push(['waitForSelector', selector, options])
    },
    async setViewportSize(viewport) {
      calls.push(['setViewportSize', viewport])
    },
    keyboard: {
      async press(key, options) {
        calls.push(['keyboard:press', key, options])
      },
    },
    async goBack(options) {
      calls.push(['goBack', options])
    },
    async goForward(options) {
      calls.push(['goForward', options])
    },
    async reload(options) {
      calls.push(['reload', options])
    },
    async pause() {
      calls.push(['pause'])
    },
    frameLocator(selector) {
      calls.push(['frameLocator', selector])
      return {
        locator: (frameSelector) => selectorFor(`frame:${frameSelector}`),
        getByText(text) {
          return {
            first() {
              return this
            },
            async click() {
              calls.push(['frame:text:click', text])
            },
          }
        },
      }
    },
    async content() {
      calls.push(['content'])
      return '<html>Dashboard</html>'
    },
    async evaluate(pageFunction, arg) {
      calls.push(['evaluate', typeof pageFunction, arg])
      return 'script-result'
    },
    async screenshot(options) {
      calls.push(['screenshot', options])
      return Buffer.from('fake-shot')
    },
    context() {
      return {
        async grantPermissions(permissions) {
          calls.push(['grantPermissions', permissions])
        },
        async setGeolocation(geolocation) {
          calls.push(['setGeolocation', geolocation])
        },
      }
    },
  }
  const page = createSoundingBrowserPage(fakePage)

  assert.equal(page.url(), currentUrl)
  assert.equal(await page.text(), 'Dashboard Ready')
  assert.equal(
    await page.text('@status'),
    'Text for [data-test="status"], [data-testid="status"]'
  )
  assert.equal(await page.content(), '<html>Dashboard</html>')
  assert.equal(await page.html(), '<html>Dashboard</html>')
  assert.equal(await page.script(() => 'ok', { from: 'test' }), 'script-result')
  assert.equal((await page.screenshot('shot.png', { fullPage: true })).toString(), 'fake-shot')
  assert.equal((await page.screenshotElement('@receipt', 'receipt.png')).toString(), 'fake-element-shot')

  await page
    .click('@login')
    .typeSlowly('Search', 'billing', { delay: 5 })
    .clear('@email')
    .append('@email', 'owner@example.com')
    .attach('@avatar', 'avatar.png')
    .drag('@card', '@dropzone')
    .wait('@ready', { state: 'visible' })
    .scroll('@section')
    .resize(390, 844)
    .withGeolocation(6.5244, 3.3792, 20)
    .key('Enter')
    .keys(['Meta+K', 'Escape'])
    .withinFrame('@billing-frame', async (frame) => {
      await frame.click('Save')
    })
    .back({ waitUntil: 'domcontentloaded' })
    .forward()
    .reload()
    .debug()

  assert.deepEqual(calls, [
    ['locator:textContent', 'body'],
    ['locator:textContent', '[data-test="status"], [data-testid="status"]'],
    ['content'],
    ['content'],
    ['evaluate', 'function', { from: 'test' }],
    ['screenshot', { fullPage: true, path: 'shot.png' }],
    [
      'locator:screenshot',
      '[data-test="receipt"], [data-testid="receipt"]',
      { path: 'receipt.png' },
    ],
    ['click', '[data-test="login"], [data-testid="login"]', undefined],
    ['label:pressSequentially', 'Search', 'billing', { delay: 5 }],
    ['fill', '[data-test="email"], [data-testid="email"]', '', undefined],
    ['inputValue', '[data-test="email"], [data-testid="email"]'],
    [
      'fill',
      '[data-test="email"], [data-testid="email"]',
      'saved-owner@example.com',
      undefined,
    ],
    ['setInputFiles', '[data-test="avatar"], [data-testid="avatar"]', 'avatar.png', undefined],
    [
      'dragAndDrop',
      '[data-test="card"], [data-testid="card"]',
      '[data-test="dropzone"], [data-testid="dropzone"]',
      undefined,
    ],
    ['waitForSelector', '[data-test="ready"], [data-testid="ready"]', { state: 'visible' }],
    ['locator:scroll', '[data-test="section"], [data-testid="section"]'],
    ['setViewportSize', { width: 390, height: 844 }],
    ['grantPermissions', ['geolocation']],
    ['setGeolocation', { latitude: 6.5244, longitude: 3.3792, accuracy: 20 }],
    ['keyboard:press', 'Enter', undefined],
    ['keyboard:press', 'Meta+K', undefined],
    ['keyboard:press', 'Escape', undefined],
    ['frameLocator', '[data-test="billing-frame"], [data-testid="billing-frame"]'],
    ['frame:text:click', 'Save'],
    ['goBack', { waitUntil: 'domcontentloaded' }],
    ['goForward', undefined],
    ['reload', undefined],
    ['pause'],
  ])
})

test('createBrowserManager resolves mobile and custom browser projects', async () => {
  const calls = []
  const fakePage = {}
  const devices = {
    'Pixel 7': {
      viewport: {
        width: 412,
        height: 915,
      },
      isMobile: true,
      hasTouch: true,
    },
  }
  const createBrowserType = (name) => ({
    launch: async (launchOptions) => {
      calls.push([`${name}:launch`, launchOptions])

      return {
        newContext: async (contextOptions) => {
          calls.push([`${name}:context`, contextOptions])

          return {
            contextOptions,
            newPage: async () => fakePage,
            close: async () => {
              calls.push([`${name}:context:close`])
            },
          }
        },
        close: async () => {
          calls.push([`${name}:browser:close`])
        },
      }
    },
  })
  const config = {
    browser: {
      enabled: true,
      type: 'chromium',
      projects: {
        desktop: {},
        mobile: {
          device: 'Pixel 7',
        },
        safari: {
          type: 'webkit',
          viewport: {
            width: 1280,
            height: 720,
          },
          contextOptions: {
            colorScheme: 'dark',
          },
          launchOptions: {
            slowMo: 25,
          },
        },
      },
      defaultProject: 'desktop',
      launchOptions: {
        timeout: 5000,
      },
    },
  }

  const createManager = () =>
    createBrowserManager({
      sails: {
        config: {
          appPath: '/tmp/app',
          port: 3333,
        },
      },
      getConfig: () => config,
      loadPlaywright: async () => ({
        chromium: createBrowserType('chromium'),
        webkit: createBrowserType('webkit'),
        devices,
      }),
      loadPlaywrightTest: async () => null,
    })

  const mobileManager = createManager()
  const mobileSession = await mobileManager.open({ project: 'mobile' })
  assert.equal(mobileSession.project, 'mobile')
  assert.equal(mobileSession.page.raw, fakePage)
  await mobileManager.close()

  const safariManager = createManager()
  const safariSession = await safariManager.open({
    project: 'safari',
    contextOptions: {
      timezoneId: 'Africa/Lagos',
    },
    launchOptions: {
      timeout: 1000,
    },
  })
  assert.equal(safariSession.project, 'safari')
  await safariManager.close()

  assert.deepEqual(calls, [
    ['chromium:launch', { headless: true, timeout: 5000 }],
    [
      'chromium:context',
      {
        baseURL: 'http://127.0.0.1:3333',
        viewport: {
          width: 412,
          height: 915,
        },
        isMobile: true,
        hasTouch: true,
      },
    ],
    ['chromium:context:close'],
    ['chromium:browser:close'],
    ['webkit:launch', { headless: true, timeout: 1000, slowMo: 25 }],
    [
      'webkit:context',
      {
        baseURL: 'http://127.0.0.1:3333',
        viewport: {
          width: 1280,
          height: 720,
        },
        colorScheme: 'dark',
        timezoneId: 'Africa/Lagos',
      },
    ],
    ['webkit:context:close'],
    ['webkit:browser:close'],
  ])
})

test('createBrowserManager reports unknown browser projects with available names', async () => {
  const manager = createBrowserManager({
    sails: {
      config: {
        appPath: '/tmp/app',
        port: 3333,
      },
    },
    getConfig: () => ({
      browser: {
        enabled: true,
        projects: {
          desktop: {},
          mobile: {
            device: 'iPhone 13',
          },
        },
        defaultProject: 'desktop',
      },
    }),
    loadPlaywright: async () => ({
      chromium: {
        launch: async () => {
          throw new Error('browser should not launch for unknown projects')
        },
      },
      devices: {},
    }),
    loadPlaywrightTest: async () => null,
  })

  await assert.rejects(
    async () => {
      await manager.open({ project: 'tablet' })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_BROWSER_PROJECT_UNAVAILABLE')
      assert.equal(error.project, 'tablet')
      assert.deepEqual(error.availableProjects, ['desktop', 'mobile'])
      return true
    }
  )
})

test('createBrowserManager captures failure artifacts with stable browser paths', async () => {
  const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sounding-artifacts-'))
  const calls = []
  const currentUrl = 'http://127.0.0.1:3333/dashboard'
  const expectedDir = path.join(artifactRoot, 'dashboard-shows-owner-stats', 'desktop')
  const fakeVideo = {
    async saveAs(target) {
      calls.push(['video:saveAs', target])
    },
  }
  const fakePage = {
    url: () => currentUrl,
    async screenshot(options) {
      calls.push(['screenshot', options])
    },
    video: () => fakeVideo,
  }

  try {
    const manager = createBrowserManager({
      sails: {
        config: {
          appPath: '/tmp/app',
          port: 3333,
        },
      },
      getConfig: () => ({
        browser: {
          enabled: true,
          projects: ['desktop'],
          defaultProject: 'desktop',
          artifacts: {
            outputDir: artifactRoot,
            screenshot: true,
            trace: true,
            video: true,
            currentUrl: true,
          },
        },
      }),
      loadPlaywright: async () => ({
        chromium: {
          launch: async () => ({
            newContext: async (contextOptions) => ({
              contextOptions,
              tracing: {
                async start(options) {
                  calls.push(['trace:start', options])
                },
                async stop(options) {
                  calls.push(['trace:stop', options])
                },
              },
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
      loadPlaywrightTest: async () => null,
    })

    const session = await manager.open({ trialName: 'Dashboard shows owner stats' })
    assert.equal(session.context.contextOptions.recordVideo.dir, expectedDir)

    const artifacts = await session.captureFailureArtifacts()
    await manager.close()

    assert.equal(artifacts.outputDir, artifactRoot)
    assert.equal(artifacts.directory, expectedDir)
    assert.equal(artifacts.project, 'desktop')
    assert.equal(artifacts.trialName, 'Dashboard shows owner stats')
    assert.equal(artifacts.currentUrl, currentUrl)
    assert.equal(artifacts.currentUrlPath, path.join(expectedDir, 'current-url.txt'))
    assert.equal(artifacts.screenshot, path.join(expectedDir, 'screenshot.png'))
    assert.equal(artifacts.trace, path.join(expectedDir, 'trace.zip'))
    assert.equal(artifacts.video, path.join(expectedDir, 'video.webm'))
    assert.deepEqual(artifacts.errors, [])
    assert.equal(await fs.readFile(path.join(expectedDir, 'current-url.txt'), 'utf8'), `${currentUrl}\n`)
    assert.deepEqual(calls, [
      ['trace:start', { screenshots: true, snapshots: true, sources: true }],
      [
        'screenshot',
        {
          path: path.join(expectedDir, 'screenshot.png'),
          fullPage: true,
        },
      ],
      ['trace:stop', { path: path.join(expectedDir, 'trace.zip') }],
      ['context:close'],
      ['video:saveAs', path.join(expectedDir, 'video.webm')],
      ['browser:close'],
    ])
  } finally {
    await fs.rm(artifactRoot, { recursive: true, force: true })
  }
})

test('createBrowserManager reports browser setup errors with stable codes', async () => {
  const disabled = createBrowserManager({
    sails: {
      config: {
        sounding: {
          browser: {
            enabled: false,
          },
        },
      },
    },
  })

  await assert.rejects(
    async () => {
      await disabled.open()
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_BROWSER_DISABLED')
      return true
    }
  )

  const missingType = createBrowserManager({
    sails: {
      config: {
        appPath: '/tmp/app',
        port: 3333,
      },
    },
    loadPlaywright: async () => ({
      devices: {},
    }),
  })

  await assert.rejects(
    async () => {
      await missingType.open({ type: 'webkit' })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_BROWSER_TYPE_UNAVAILABLE')
      assert.equal(error.browserType, 'webkit')
      return true
    }
  )
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

test('createAuthHelpers reports auth input errors with stable codes', async () => {
  const auth = createAuthHelpers({
    sails: {},
    world: {
      current: {},
    },
    mailbox: {
      latest() {
        return null
      },
    },
    request: {
      post: async () => ({ status: 302 }),
    },
  })

  await assert.rejects(
    async () => {
      await auth.resolveActor(null)
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_AUTH_ACTOR_REQUIRED')
      return true
    }
  )

  await assert.rejects(
    async () => {
      await auth.resolveActor({ id: 1 }, { createIfMissing: false })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_AUTH_EMAIL_UNRESOLVED')
      assert.deepEqual(error.details, {
        actor: {
          id: 1,
        },
      })
      return true
    }
  )
})

test('createAuthHelpers lists available world actors for unresolved aliases', async () => {
  const auth = createAuthHelpers({
    sails: {},
    world: {
      current: {
        users: {
          reader: {
            id: 1,
            email: 'reader@example.com',
          },
        },
        creators: {
          owner: {
            id: 2,
            email: 'owner@example.com',
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
      post: async () => ({ status: 302 }),
    },
  })

  await assert.rejects(
    async () => {
      await auth.resolveActor('editor', { createIfMissing: false })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_AUTH_EMAIL_UNRESOLVED')
      assert.equal(error.actor, 'editor')
      assert.deepEqual(error.availableActors, ['owner', 'reader'])
      assert.match(error.message, /Available actors: owner, reader/)
      return true
    }
  )
})

test('createAuthHelpers can log in with password through the real browser form', async () => {
  const calls = []
  const page = {
    async goto(target) {
      calls.push(['goto', target])
    },
    async fill(selector, value) {
      calls.push(['fill', selector, value])
    },
    async check(selector) {
      calls.push(['check', selector])
    },
    async click(selector) {
      calls.push(['click', selector])
    },
  }

  const auth = createAuthHelpers({
    sails: {
      config: {
        sounding: {
          auth: {
            password: {
              pageQuery: {
                mode: 'password',
              },
            },
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
        },
      },
    },
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
      post: async () => ({ status: 302 }),
    },
  })

  const login = await auth.login.withPassword('reader', page, {
    password: 'secret123',
    rememberMe: true,
    returnUrl: '/dashboard',
  })

  assert.equal(login.path, '/login?mode=password&returnUrl=%2Fdashboard')
  assert.deepEqual(calls, [
    ['goto', '/login?mode=password&returnUrl=%2Fdashboard'],
    ['fill', 'input[name="email"], input[type="email"]', 'reader@example.com'],
    ['fill', 'input[name="password"], input[type="password"]', 'secret123'],
    ['check', 'input[name="rememberMe"], input[id="rememberMe"], input[type="checkbox"]'],
    ['click', 'button[type="submit"], input[type="submit"]'],
  ])
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
