const fs = require('node:fs/promises')
const path = require('node:path')

const { resolveBaseUrl } = require('./create-request-client')
const { createSoundingError } = require('./create-error')
const { createSoundingBrowserPage } = require('./create-browser-page')
const { loadDependencyFromApp } = require('./resolve-dependency')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingBrowserArtifactMode} SoundingBrowserArtifactMode */
/** @typedef {import('./types').SoundingBrowserArtifacts} SoundingBrowserArtifacts */
/** @typedef {import('./types').SoundingBrowserResolvedArtifactsConfig} SoundingBrowserResolvedArtifactsConfig */
/** @typedef {import('./types').SoundingBrowserManager} SoundingBrowserManager */
/** @typedef {import('./types').SoundingBrowserOpenOptions} SoundingBrowserOpenOptions */
/** @typedef {import('./types').SoundingBrowserSession} SoundingBrowserSession */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

const ARTIFACT_MODES = ['off', 'on', 'on-failure']
const MOBILE_FALLBACK_OPTIONS = {
  viewport: {
    width: 390,
    height: 844,
  },
  isMobile: true,
  hasTouch: true,
}

/**
 * @param {string} appPath
 * @param {{ resolveImplementation?: (moduleId: string, options?: { paths?: string[] }) => string }} [options]
 * @returns {any}
 */
function defaultLoadPlaywright(appPath, options = {}) {
  return loadDependencyFromApp({
    appPath,
    moduleId: 'playwright',
    purpose: 'open browser trials',
    install: 'npm install -D playwright',
    resolveImplementation: options.resolveImplementation,
  })
}

/**
 * @param {string} appPath
 * @param {{ resolveImplementation?: (moduleId: string, options?: { paths?: string[] }) => string }} [options]
 * @returns {any}
 */
function defaultLoadPlaywrightTest(appPath, options = {}) {
  return loadDependencyFromApp({
    appPath,
    moduleId: '@playwright/test',
    purpose: 'use Playwright expect fallback in browser trials',
    install: 'npm install -D @playwright/test',
    optional: true,
    resolveImplementation: options.resolveImplementation,
  })
}

/**
 * @param {string} projectName
 * @param {AnyRecord} [devices]
 * @returns {AnyRecord}
 */
function resolveProjectOptions(projectName, devices = {}) {
  if (projectName === 'mobile') {
    return devices['iPhone 13'] || MOBILE_FALLBACK_OPTIONS
  }

  return {}
}

/**
 * @param {any} projects
 * @returns {AnyRecord[]}
 */
function normalizeBrowserProjects(projects) {
  if (Array.isArray(projects)) {
    const entries = projects
      .map((entry) => {
        if (typeof entry === 'string') {
          return {
            name: entry,
          }
        }

        if (isPlainObject(entry) && typeof entry.name === 'string') {
          return {
            ...entry,
            name: entry.name,
          }
        }

        return null
      })
      .filter(Boolean)

    return entries.length ? entries : [{ name: 'desktop' }]
  }

  if (isPlainObject(projects)) {
    const entries = Object.entries(projects).map(([name, value]) => ({
      ...(isPlainObject(value) ? value : {}),
      name,
    }))

    return entries.length ? entries : [{ name: 'desktop' }]
  }

  return [{ name: 'desktop' }]
}

/**
 * @param {any} projects
 * @returns {string[]}
 */
function getBrowserProjectNames(projects) {
  return normalizeBrowserProjects(projects).map((project) => project.name)
}

/**
 * @param {AnyRecord} project
 * @param {AnyRecord} devices
 * @returns {AnyRecord}
 */
function resolveProjectDeviceOptions(project, devices = {}) {
  if (project.device) {
    const deviceOptions = devices[project.device]

    if (!deviceOptions) {
      throw createSoundingError({
        code: 'E_SOUNDING_BROWSER_DEVICE_UNAVAILABLE',
        message: `Sounding could not find a Playwright device named \`${project.device}\` for browser project \`${project.name}\`.`,
        details: {
          project: project.name,
          device: project.device,
          availableDevices: Object.keys(devices).sort(),
        },
      })
    }

    return deviceOptions
  }

  return resolveProjectOptions(project.name, devices)
}

/**
 * @param {{
 *   config: AnyRecord,
 *   options?: SoundingBrowserOpenOptions,
 *   devices?: AnyRecord,
 * }} input
 * @returns {{ name: string, type?: string, launchOptions: AnyRecord, contextOptions: AnyRecord }}
 */
function resolveBrowserProject({ config, options = {}, devices = {} }) {
  const projects = normalizeBrowserProjects(config.browser?.projects)
  const projectName =
    options.project ||
    config.browser?.defaultProject ||
    projects[0]?.name ||
    'desktop'
  const project = projects.find((candidate) => candidate.name === projectName)

  if (!project) {
    throw createSoundingError({
      code: 'E_SOUNDING_BROWSER_PROJECT_UNAVAILABLE',
      message: `Sounding could not find a browser project named \`${projectName}\`.`,
      details: {
        project: projectName,
        availableProjects: projects.map((candidate) => candidate.name),
      },
    })
  }

  return {
    name: project.name,
    type: project.type,
    launchOptions: project.launchOptions || {},
    contextOptions: {
      ...resolveProjectDeviceOptions(project, devices),
      ...(project.viewport ? { viewport: project.viewport } : {}),
      ...(project.contextOptions || {}),
    },
  }
}

/**
 * @param {any} value
 * @param {SoundingBrowserArtifactMode} fallback
 * @returns {SoundingBrowserArtifactMode}
 */
function normalizeArtifactMode(value, fallback) {
  if (value === undefined) {
    return fallback
  }

  if (value === true) {
    return 'on-failure'
  }

  if (value === false || value === null) {
    return 'off'
  }

  if (ARTIFACT_MODES.includes(value)) {
    return value
  }

  return fallback
}

/**
 * @param {SoundingBrowserArtifactMode} mode
 * @returns {boolean}
 */
function recordsArtifact(mode) {
  return mode === 'on' || mode === 'on-failure'
}

/**
 * @param {SoundingBrowserArtifactMode} mode
 * @returns {boolean}
 */
function capturesFailureArtifact(mode) {
  return mode === 'on' || mode === 'on-failure'
}

/**
 * @param {SoundingBrowserArtifactMode} mode
 * @returns {boolean}
 */
function capturesSuccessArtifact(mode) {
  return mode === 'on'
}

/**
 * @param {any} value
 * @returns {value is AnyRecord}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {AnyRecord | boolean | undefined} value
 * @param {SoundingBrowserResolvedArtifactsConfig} fallback
 * @returns {SoundingBrowserResolvedArtifactsConfig}
 */
function mergeArtifactsConfig(value, fallback) {
  if (value === false) {
    return {
      ...fallback,
      screenshot: 'off',
      trace: 'off',
      video: 'off',
      currentUrl: false,
    }
  }

  if (value === true || value === undefined || value === null) {
    return fallback
  }

  if (!isPlainObject(value)) {
    return fallback
  }

  return {
    outputDir:
      typeof value.outputDir === 'string' && value.outputDir.trim()
        ? value.outputDir
        : fallback.outputDir,
    screenshot: normalizeArtifactMode(value.screenshot, fallback.screenshot),
    trace: normalizeArtifactMode(value.trace, fallback.trace),
    video: normalizeArtifactMode(value.video, fallback.video),
    currentUrl:
      typeof value.currentUrl === 'boolean' ? value.currentUrl : fallback.currentUrl,
  }
}

/**
 * @param {AnyRecord} config
 * @param {SoundingBrowserOpenOptions} options
 * @returns {SoundingBrowserResolvedArtifactsConfig}
 */
function resolveArtifactsConfig(config, options = {}) {
  const defaults = /** @type {SoundingBrowserResolvedArtifactsConfig} */ ({
    outputDir: '.tmp/sounding/artifacts',
    screenshot: 'on-failure',
    trace: 'off',
    video: 'off',
    currentUrl: true,
  })
  const globalArtifacts = mergeArtifactsConfig(config.browser?.artifacts, defaults)

  return mergeArtifactsConfig(options.artifacts, globalArtifacts)
}

/**
 * @param {string} value
 * @returns {string}
 */
function slugifyArtifactSegment(value) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'browser-trial'
}

/**
 * @param {string} appPath
 * @param {SoundingBrowserResolvedArtifactsConfig} artifacts
 * @param {{ trialName?: string, projectName: string }} metadata
 */
function resolveArtifactPaths(appPath, artifacts, metadata) {
  const outputRoot = path.isAbsolute(artifacts.outputDir)
    ? artifacts.outputDir
    : path.resolve(appPath, artifacts.outputDir)
  const trialSlug = slugifyArtifactSegment(metadata.trialName || 'browser-trial')
  const projectSlug = slugifyArtifactSegment(metadata.projectName || 'desktop')
  const directory = path.join(outputRoot, trialSlug, projectSlug)

  return {
    outputRoot,
    directory,
    currentUrl: path.join(directory, 'current-url.txt'),
    screenshot: path.join(directory, 'screenshot.png'),
    trace: path.join(directory, 'trace.zip'),
    video: path.join(directory, 'video.webm'),
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatCaptureError(error) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * @param {SoundingBrowserArtifacts['errors']} errors
 * @param {string} artifact
 * @param {unknown} error
 */
function pushCaptureError(errors, artifact, error) {
  errors.push({
    artifact,
    message: formatCaptureError(error),
  })
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
      throw createSoundingError({
        code: 'E_SOUNDING_BROWSER_DISABLED',
        message: 'Sounding browser support is disabled in `config/sounding.js`.',
      })
    }

    const appPath = appPathResolver()
    const playwright = await loadPlaywright(appPath)
    const playwrightTest = await Promise.resolve()
      .then(() => loadPlaywrightTest(appPath))
      .catch((error) => {
        if (
          error?.code === 'E_SOUNDING_DEPENDENCY_MISSING' &&
          error.dependency === '@playwright/test'
        ) {
          return null
        }

        throw error
      })

    const project = resolveBrowserProject({
      config,
      options,
      devices: playwright.devices || {},
    })
    const browserTypeName = options.type || project.type || config.browser?.type || 'chromium'
    const browserType = playwright?.[browserTypeName]

    if (!browserType?.launch) {
      throw createSoundingError({
        code: 'E_SOUNDING_BROWSER_TYPE_UNAVAILABLE',
        message: `Sounding could not find a Playwright browser type named \`${browserTypeName}\`.`,
        details: {
          browserType: browserTypeName,
        },
      })
    }

    const artifacts = resolveArtifactsConfig(config, options)
    const artifactPaths = resolveArtifactPaths(appPath, artifacts, {
      trialName: options.trialName,
      projectName: project.name,
    })
    const contextOptions = {
      ...project.contextOptions,
      ...(options.contextOptions || {}),
    }

    if (recordsArtifact(artifacts.video) && contextOptions.recordVideo === undefined) {
      contextOptions.recordVideo = {
        dir: artifactPaths.directory,
      }
    }

    const browser = await browserType.launch({
      headless: true,
      ...(config.browser?.launchOptions || {}),
      ...project.launchOptions,
      ...(options.launchOptions || {}),
    })

    const context = await browser.newContext({
      baseURL: resolveBaseUrl({ sails, getConfig }),
      ...contextOptions,
    })

    const rawPage = await context.newPage()
    const page = createSoundingBrowserPage(rawPage, {
      project: project.name,
      getArtifacts: () => latestArtifacts,
    })
    let contextClosed = false
    let traceStarted = false
    let traceStopped = false
    /** @type {SoundingBrowserArtifacts | null} */
    let latestArtifacts = null

    if (recordsArtifact(artifacts.trace) && context.tracing?.start) {
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      })
      traceStarted = true
    }

    /**
     * @param {SoundingBrowserArtifacts} collected
     * @param {boolean} keepTrace
     */
    async function finalizeTrace(collected, keepTrace) {
      if (!traceStarted || traceStopped || !context.tracing?.stop) {
        return
      }

      try {
        if (keepTrace) {
          await fs.mkdir(artifactPaths.directory, { recursive: true })
          await context.tracing.stop({ path: artifactPaths.trace })
          collected.trace = artifactPaths.trace
        } else {
          await context.tracing.stop()
        }

        traceStopped = true
      } catch (error) {
        pushCaptureError(collected.errors, 'trace', error)
      }
    }

    /**
     * @param {SoundingBrowserArtifacts} collected
     * @param {boolean} keepVideo
     */
    async function finalizeVideo(collected, keepVideo) {
      const video = typeof rawPage.video === 'function' ? rawPage.video() : null

      if (!video) {
        return
      }

      try {
        if (keepVideo) {
          await fs.mkdir(artifactPaths.directory, { recursive: true })

          if (typeof video.saveAs === 'function') {
            await video.saveAs(artifactPaths.video)
            collected.video = artifactPaths.video
            return
          }

          if (typeof video.path === 'function') {
            collected.video = await video.path()
          }

          return
        }

        if (typeof video.delete === 'function') {
          await video.delete()
          return
        }

        if (typeof video.path === 'function') {
          const videoPath = await video.path()
          await fs.rm(videoPath, { force: true }).catch(() => {})
        }
      } catch (error) {
        pushCaptureError(collected.errors, 'video', error)
      }
    }

    /**
     * @param {{ failed: boolean, collected: SoundingBrowserArtifacts }} args
     */
    async function closeContext({ failed, collected }) {
      if (contextClosed) {
        return
      }

      await finalizeTrace(
        collected,
        failed ? capturesFailureArtifact(artifacts.trace) : capturesSuccessArtifact(artifacts.trace)
      )
      await context.close?.()
      contextClosed = true
      await finalizeVideo(
        collected,
        failed ? capturesFailureArtifact(artifacts.video) : capturesSuccessArtifact(artifacts.video)
      )
    }

    /**
     * @returns {SoundingBrowserArtifacts}
     */
    function createArtifactsMetadata() {
      return {
        outputDir: artifactPaths.outputRoot,
        directory: artifactPaths.directory,
        project: project.name,
        trialName: options.trialName,
        errors: [],
      }
    }

    async function captureFailureArtifacts() {
      const collected = createArtifactsMetadata()

      if (artifacts.currentUrl && typeof rawPage.url === 'function') {
        try {
          const currentUrl = rawPage.url()
          if (currentUrl) {
            await fs.mkdir(artifactPaths.directory, { recursive: true })
            await fs.writeFile(artifactPaths.currentUrl, `${currentUrl}\n`)
            collected.currentUrl = currentUrl
            collected.currentUrlPath = artifactPaths.currentUrl
          }
        } catch (error) {
          pushCaptureError(collected.errors, 'currentUrl', error)
        }
      }

      if (capturesFailureArtifact(artifacts.screenshot) && typeof rawPage.screenshot === 'function') {
        try {
          await fs.mkdir(artifactPaths.directory, { recursive: true })
          await rawPage.screenshot({
            path: artifactPaths.screenshot,
            fullPage: true,
          })
          collected.screenshot = artifactPaths.screenshot
        } catch (error) {
          pushCaptureError(collected.errors, 'screenshot', error)
        }
      }

      await finalizeTrace(collected, capturesFailureArtifact(artifacts.trace))

      if (recordsArtifact(artifacts.video)) {
        try {
          await closeContext({ failed: true, collected })
        } catch (error) {
          pushCaptureError(collected.errors, 'video', error)
        }
      }

      latestArtifacts = collected
      return collected
    }

    async function closeSessionContext() {
      const collected = latestArtifacts || createArtifactsMetadata()
      await closeContext({ failed: false, collected })
      latestArtifacts = collected
      return collected
    }

    session = {
      playwright,
      browser,
      context,
      page,
      rawPage,
      expect: playwrightTest?.expect,
      project: project.name,
      artifacts,
      captureFailureArtifacts,
      closeSessionContext,
      get latestArtifacts() {
        return latestArtifacts
      },
    }

    return session
  }

  async function close() {
    if (!session) {
      return
    }

    await session.closeSessionContext?.()
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
  resolveBrowserProject,
  normalizeBrowserProjects,
  getBrowserProjectNames,
  resolveArtifactsConfig,
  slugifyArtifactSegment,
}
