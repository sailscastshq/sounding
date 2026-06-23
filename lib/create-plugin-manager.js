const fs = require('node:fs')
const path = require('node:path')
const EventEmitter = require('node:events')

const { createAppManager } = require('./create-app-manager')
const { createSoundingError } = require('./create-error')
const { createSessionCookie } = require('./create-session-cookie')
const {
  createRequestActorUnresolvedError,
  resolveActorHeaders,
  resolveActorSession,
  resolveBaseUrl,
  resolveUrl,
  resolveWorldActor,
} = require('./create-request-client')
const { loadDependencyFromApp } = require('./resolve-dependency')
const { resolveAuthConfig } = require('./resolve-auth-config')

/** @typedef {import('./types').AnyRecord} AnyRecord */

const PLUGIN_PACKAGE_PATTERNS = [/^sounding-plugin-[a-z0-9][a-z0-9-]*$/i, /^@sounding\/plugin-[a-z0-9][a-z0-9-]*$/i]

/**
 * @param {string} name
 * @returns {boolean}
 */
function isSoundingPluginPackageName(name) {
  return PLUGIN_PACKAGE_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * @param {string} appPath
 * @returns {AnyRecord | null}
 */
function readPackageJson(appPath) {
  const packagePath = path.join(appPath, 'package.json')

  if (!fs.existsSync(packagePath)) {
    return null
  }

  return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
}

/**
 * @param {AnyRecord | null} packageJson
 * @returns {string[]}
 */
function discoverDependencyPluginNames(packageJson) {
  if (!packageJson) {
    return []
  }

  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.optionalDependencies || {}),
    ...(packageJson.peerDependencies || {}),
  }

  return Object.keys(dependencies).filter(isSoundingPluginPackageName).sort()
}

/**
 * @param {string} appPath
 * @returns {Array<{ name: string, localPath: string }>}
 */
function discoverLocalPluginPackages(appPath) {
  const pluginsPath = path.join(appPath, 'plugins')

  if (!fs.existsSync(pluginsPath)) {
    return []
  }

  const specs = []

  for (const entry of fs.readdirSync(pluginsPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    const pluginPath = path.join(pluginsPath, entry.name)
    const packageJson = readPackageJson(pluginPath)
    const name = packageJson?.name

    if (!name || !isSoundingPluginPackageName(name)) {
      continue
    }

    specs.push({
      name,
      localPath: path.join(pluginPath, packageJson.main || 'index.js'),
    })
  }

  return specs.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * @param {string} appPath
 * @returns {Array<{ name: string, moduleId?: string, localPath?: string }>}
 */
function discoverPluginSpecs(appPath = process.cwd()) {
  const resolvedAppPath = path.resolve(appPath)
  const specs = new Map()

  for (const name of discoverDependencyPluginNames(readPackageJson(resolvedAppPath))) {
    specs.set(name, {
      name,
      moduleId: name,
    })
  }

  for (const localSpec of discoverLocalPluginPackages(resolvedAppPath)) {
    specs.set(localSpec.name, localSpec)
  }

  return Array.from(specs.values())
}

/**
 * @param {string[]} appPaths
 * @returns {Array<{ name: string, moduleId?: string, localPath?: string }>}
 */
function discoverPluginSpecsFrom(appPaths) {
  const specs = new Map()

  for (const appPath of appPaths) {
    for (const spec of discoverPluginSpecs(appPath)) {
      if (!specs.has(spec.name)) {
        specs.set(spec.name, spec)
      }
    }
  }

  return Array.from(specs.values())
}

/**
 * @param {any} loaded
 * @returns {Function}
 */
function normalizePluginFactory(loaded) {
  const candidate = loaded?.default || loaded

  if (typeof candidate !== 'function') {
    throw createSoundingError({
      code: 'E_SOUNDING_PLUGIN_INVALID',
      name: 'SoundingPluginError',
      message: 'Sounding plugins must export a function.',
    })
  }

  return candidate
}

/**
 * @param {{
 *   spec: { name: string, moduleId?: string, localPath?: string },
 *   appPath: string,
 *   api: AnyRecord,
 *   requireImplementation?: NodeJS.Require,
 * }} input
 * @returns {AnyRecord}
 */
function loadPlugin({ spec, appPath, api, requireImplementation = require }) {
  const loaded = spec.localPath
    ? requireImplementation(spec.localPath)
    : loadDependencyFromApp({
        appPath,
        moduleId: spec.moduleId || spec.name,
        dependency: spec.name,
        purpose: 'load a Sounding plugin',
        install: `npm install -D ${spec.name}`,
      })
  const factory = normalizePluginFactory(loaded)
  const plugin = factory(api)

  if (!plugin || typeof plugin !== 'object') {
    throw createSoundingError({
      code: 'E_SOUNDING_PLUGIN_INVALID',
      name: 'SoundingPluginError',
      message: `Sounding plugin \`${spec.name}\` must return a plugin object.`,
      details: {
        plugin: spec.name,
      },
    })
  }

  return {
    ...plugin,
    packageName: spec.name,
    name: plugin.name || spec.name,
  }
}

/**
 * @param {{ appPath?: string, events?: EventEmitter }} [options]
 * @returns {AnyRecord}
 */
function createPluginApi({ appPath = process.cwd(), events } = {}) {
  return {
    appPath: path.resolve(appPath),
    events,
    createAppManager,
    createSessionCookie,
    createSoundingError,
    resolveActorHeaders,
    resolveActorSession,
    resolveAuthConfig,
    resolveBaseUrl,
    resolveUrl,
    resolveWorldActor,
    createRequestActorUnresolvedError,
    loadDependencyFromApp,
  }
}

/**
 * @param {{
 *   appPath?: string,
 *   specs?: Array<{ name: string, moduleId?: string, localPath?: string }>,
 *   plugins?: AnyRecord[],
 *   requireImplementation?: NodeJS.Require,
 * }} [options]
 */
function createPluginManager({
  appPath = process.cwd(),
  specs,
  plugins,
  requireImplementation = require,
} = {}) {
  const resolvedAppPath = path.resolve(appPath)
  const events = new EventEmitter()
  const api = createPluginApi({ appPath: resolvedAppPath, events })
  const loadedPlugins =
    plugins ||
    (specs || discoverPluginSpecsFrom([resolvedAppPath, process.cwd()])).map((spec) =>
      loadPlugin({
        spec,
        appPath: resolvedAppPath,
        api,
        requireImplementation,
      })
    )

  for (const plugin of loadedPlugins) {
    events.emit('plugin:loaded', plugin)
  }

  return {
    appPath: resolvedAppPath,
    events,

    get plugins() {
      return [...loadedPlugins]
    },

    command(name) {
      for (const plugin of loadedPlugins) {
        const command = plugin.commands?.[name]

        if (typeof command === 'function') {
          return {
            plugin,
            command,
          }
        }
      }

      return null
    },

    testMethods() {
      const methods = []

      for (const plugin of loadedPlugins) {
        for (const [name, definition] of Object.entries(plugin.testMethods || {})) {
          methods.push({
            plugin,
            name,
            definition: definition || {},
          })
        }
      }

      return methods
    },

    async trialContext(input) {
      const context = {}

      for (const plugin of loadedPlugins) {
        if (typeof plugin.trial !== 'function') {
          continue
        }

        events.emit('trial:plugin:before', {
          plugin,
          title: input.title,
        })

        const extension = await plugin.trial({
          ...input,
          appPath: resolvedAppPath,
          plugin,
          events,
        })

        if (extension && typeof extension === 'object') {
          Object.assign(context, extension)
        }

        events.emit('trial:plugin:after', {
          plugin,
          title: input.title,
          keys: Object.keys(extension || {}),
        })
      }

      return context
    },
  }
}

function createMissingStressPluginError() {
  return createSoundingError({
    code: 'E_SOUNDING_PLUGIN_COMMAND_MISSING',
    name: 'SoundingPluginError',
    message:
      'Sounding stress testing lives in `sounding-plugin-stress`. Install it with: `npm install -D sounding-plugin-stress`.',
    details: {
      command: 'stress',
      install: 'npm install -D sounding-plugin-stress',
      plugin: 'sounding-plugin-stress',
    },
  })
}

module.exports = {
  createMissingStressPluginError,
  createPluginApi,
  createPluginManager,
  discoverDependencyPluginNames,
  discoverLocalPluginPackages,
  discoverPluginSpecs,
  discoverPluginSpecsFrom,
  isSoundingPluginPackageName,
}
