const { resolveBaseUrl } = require('./create-request-client')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingBrowserManager} SoundingBrowserManager */
/** @typedef {import('./types').SoundingBrowserOpenOptions} SoundingBrowserOpenOptions */
/** @typedef {import('./types').SoundingBrowserSession} SoundingBrowserSession */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {string} appPath
 * @param {string} moduleId
 * @returns {any}
 */
function resolveModuleFromApp(appPath, moduleId) {
  return require(require.resolve(moduleId, { paths: [appPath, process.cwd(), __dirname] }))
}

/**
 * @param {string} appPath
 * @returns {any}
 */
function defaultLoadPlaywright(appPath) {
  return resolveModuleFromApp(appPath, 'playwright')
}

/**
 * @param {string} appPath
 * @returns {any}
 */
function defaultLoadPlaywrightTest(appPath) {
  return resolveModuleFromApp(appPath, '@playwright/test')
}

/**
 * @param {string} projectName
 * @param {AnyRecord} [devices]
 * @returns {AnyRecord}
 */
function resolveProjectOptions(projectName, devices = {}) {
  if (projectName === 'mobile') {
    return (
      devices['iPhone 13'] || {
        viewport: {
          width: 390,
          height: 844,
        },
        isMobile: true,
        hasTouch: true,
      }
    )
  }

  return {}
}

/**
 * @param {{
 *   sails?: SoundingSailsApp,
 *   getConfig?: () => AnyRecord,
 *   appPathResolver?: () => string,
 *   loadPlaywright?: (appPath: string) => any,
 *   loadPlaywrightTest?: (appPath: string) => any,
 * }} [options]
 * @returns {SoundingBrowserManager}
 */
function createBrowserManager({
  sails,
  getConfig,
  appPathResolver = () => sails?.config?.appPath || process.cwd(),
  loadPlaywright = defaultLoadPlaywright,
  loadPlaywrightTest = defaultLoadPlaywrightTest,
} = {}) {
  let session = null

  /**
   * @param {SoundingBrowserOpenOptions} [options]
   * @returns {Promise<SoundingBrowserSession>}
   */
  async function open(options = {}) {
    if (session) {
      return session
    }

    const config = typeof getConfig === 'function' ? getConfig() : sails?.config?.sounding || {}

    if (config.browser?.enabled === false) {
      throw new Error('Sounding browser support is disabled in `config/sounding.js`.')
    }

    const appPath = appPathResolver()
    const playwright = await loadPlaywright(appPath)
    const playwrightTest = await Promise.resolve()
      .then(() => loadPlaywrightTest(appPath))
      .catch(() => null)

    const browserTypeName = options.type || config.browser?.type || 'chromium'
    const browserType = playwright?.[browserTypeName]

    if (!browserType?.launch) {
      throw new Error(
        `Sounding could not find a Playwright browser type named \`${browserTypeName}\`.`
      )
    }

    const projectName =
      options.project ||
      config.browser?.defaultProject ||
      config.browser?.projects?.[0] ||
      'desktop'

    const browser = await browserType.launch({
      headless: true,
      ...(config.browser?.launchOptions || {}),
      ...(options.launchOptions || {}),
    })

    const context = await browser.newContext({
      baseURL: resolveBaseUrl({ sails, getConfig }),
      ...resolveProjectOptions(projectName, playwright.devices || {}),
      ...(options.contextOptions || {}),
    })

    const page = await context.newPage()

    session = {
      playwright,
      browser,
      context,
      page,
      expect: playwrightTest?.expect,
      project: projectName,
    }

    return session
  }

  async function close() {
    if (!session) {
      return
    }

    await session.context?.close?.()
    await session.browser?.close?.()
    session = null
  }

  return {
    open,
    close,
    get active() {
      return Boolean(session?.page)
    },
    get page() {
      return session?.page
    },
    get context() {
      return session?.context
    },
    get expect() {
      return session?.expect
    },
  }
}

module.exports = {
  createBrowserManager,
  defaultLoadPlaywright,
  defaultLoadPlaywrightTest,
  resolveProjectOptions,
}
