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
 * @returns {string[]}
 */
function listDefinitionFiles(directory) {
  const output = []

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const nextPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      output.push(...listDefinitionFiles(nextPath))
      continue
    }

    if (WORLD_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(nextPath)
    }
  }

  return output.sort()
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
 * @param {{ world: SoundingWorldEngine, appPath: string, config: SoundingConfig, sails?: SoundingSailsApp }} input
 * @returns {Promise<string[]>}
 */
async function loadWorldFiles({ world, appPath, config, sails }) {
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

    for (const filePath of listDefinitionFiles(directory)) {
      const loaded = await loadModule(filePath)
      await registerExport(loaded, api, filePath)
      loadedFiles.push(filePath)
    }
  }

  return loadedFiles
}

module.exports = {
  loadWorldFiles,
  listDefinitionFiles,
  loadModule,
}
