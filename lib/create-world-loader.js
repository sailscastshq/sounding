const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const {
  defineFactory,
  defineScenario,
  isFactoryDefinition,
  isScenarioDefinition,
} = require('./define-world')
const { createSoundingError } = require('./create-error')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingConfig} SoundingConfig */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */
/** @typedef {import('./types').SoundingWorldEngine} SoundingWorldEngine */

const WORLD_EXTENSIONS = new Set(['.js', '.cjs', '.mjs'])

/**
 * @param {string} directory
 * @param {{ directories?: string[] }} [options]
 * @returns {string[]}
 */
function listDefinitionFiles(directory, options = {}) {
  const output = []
  options.directories?.push(directory)

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const nextPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      output.push(...listDefinitionFiles(nextPath, options))
      continue
    }

    if (WORLD_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(nextPath)
    }
  }

  return output.sort()
}

/**
 * @param {string} entryPath
 * @returns {{ path: string, mtimeMs: number, size: number }}
 */
function getFileSignature(entryPath) {
  const stat = fs.statSync(entryPath)

  return {
    path: entryPath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  }
}

/**
 * @returns {{
 *   directories: Map<string, { signatures: Array<{ path: string, mtimeMs: number, size: number }>, files: string[] }>,
 *   modules: Map<string, { signature: { path: string, mtimeMs: number, size: number }, value: any }>,
 *   stats: { directoryScans: number, moduleLoads: number },
 *   clear(): void,
 * }}
 */
function createWorldLoaderCache() {
  const stats = {
    directoryScans: 0,
    moduleLoads: 0,
  }

  return {
    directories: new Map(),
    modules: new Map(),
    stats,
    clear() {
      this.directories.clear()
      this.modules.clear()
      stats.directoryScans = 0
      stats.moduleLoads = 0
    },
  }
}

/**
 * @param {{ path: string, mtimeMs: number, size: number }} expected
 * @returns {boolean}
 */
function signatureMatches(expected) {
  if (!fs.existsSync(expected.path)) {
    return false
  }

  const actual = getFileSignature(expected.path)
  return actual.mtimeMs === expected.mtimeMs && actual.size === expected.size
}

/**
 * @param {string} directory
 * @param {ReturnType<typeof createWorldLoaderCache> | undefined} cache
 * @returns {string[]}
 */
function getDefinitionFiles(directory, cache) {
  if (!cache) {
    return listDefinitionFiles(directory)
  }

  const cached = cache.directories.get(directory)

  if (cached && cached.signatures.every(signatureMatches)) {
    return cached.files
  }

  const directories = []
  const files = listDefinitionFiles(directory, { directories })
  cache.stats.directoryScans += 1
  cache.directories.set(directory, {
    signatures: directories.map(getFileSignature),
    files,
  })

  return files
}

/**
 * @param {string} filePath
 * @returns {Promise<any>}
 */
async function loadModule(filePath) {
  try {
    delete require.cache[require.resolve(filePath)]
    return require(filePath)
  } catch (error) {
    if (error.code !== 'ERR_REQUIRE_ESM') {
      throw error
    }

    return import(`${pathToFileURL(filePath).href}?t=${Date.now()}`)
  }
}

/**
 * @param {string} filePath
 * @param {ReturnType<typeof createWorldLoaderCache> | undefined} cache
 * @returns {Promise<any>}
 */
async function loadCachedModule(filePath, cache) {
  if (!cache) {
    return loadModule(filePath)
  }

  const signature = getFileSignature(filePath)
  const cached = cache.modules.get(filePath)

  if (
    cached &&
    cached.signature.mtimeMs === signature.mtimeMs &&
    cached.signature.size === signature.size
  ) {
    return cached.value
  }

  const value = await loadModule(filePath)
  cache.stats.moduleLoads += 1
  cache.modules.set(filePath, {
    signature,
    value,
  })
  return value
}

/**
 * @param {any} value
 * @param {AnyRecord} api
 * @param {string} source
 * @returns {Promise<void>}
 */
async function registerExport(value, api, source) {
  const entry = value?.default ?? value

  if (entry === undefined || entry === null) {
    return
  }

  if (Array.isArray(entry)) {
    for (const item of entry) {
      await registerExport(item, api, source)
    }
    return
  }

  if (isFactoryDefinition(entry) || isScenarioDefinition(entry)) {
    api.world.register(entry)
    return
  }

  if (typeof entry === 'function') {
    const returned = await entry(api)

    if (returned !== undefined) {
      await registerExport(returned, api, source)
    }

    return
  }

  if (typeof entry === 'object' && (entry.factories || entry.scenarios)) {
    for (const factory of entry.factories || []) {
      await registerExport(factory, api, source)
    }

    for (const scenario of entry.scenarios || []) {
      await registerExport(scenario, api, source)
    }

    return
  }

  throw createSoundingError({
    code: 'E_SOUNDING_WORLD_DEFINITION_UNKNOWN',
    message: `Sounding could not understand the world definition exported from ${source}.`,
    details: {
      source,
    },
  })
}

/**
 * @param {{ world: SoundingWorldEngine, appPath: string, config: SoundingConfig, sails?: SoundingSailsApp, cache?: ReturnType<typeof createWorldLoaderCache> }} input
 * @returns {Promise<string[]>}
 */
async function loadWorldFiles({ world, appPath, config, sails, cache }) {
  const directories = [config.world?.factories, config.world?.scenarios]
    .filter(Boolean)
    .map((relativePath) => path.resolve(appPath, relativePath))

  const loadedFiles = []
  const api = {
    sails,
    world,
    defineFactory,
    defineScenario,
    factory: defineFactory,
    scenario: defineScenario,
    registerFactory: world.defineFactory.bind(world),
    registerScenario: world.defineScenario.bind(world),
  }

  for (const directory of directories) {
    if (!fs.existsSync(directory)) {
      continue
    }

    for (const filePath of getDefinitionFiles(directory, cache)) {
      const loaded = await loadCachedModule(filePath, cache)
      await registerExport(loaded, api, filePath)
      loadedFiles.push(filePath)
    }
  }

  return loadedFiles
}

module.exports = {
  createWorldLoaderCache,
  loadWorldFiles,
  listDefinitionFiles,
  loadModule,
}
