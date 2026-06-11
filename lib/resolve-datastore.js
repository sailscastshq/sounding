const path = require('node:path')
const { createSoundingError } = require('./create-error')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingConfig} SoundingConfig */
/** @typedef {import('./types').SoundingDatastoreState} SoundingDatastoreState */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {NodeJS.ProcessEnv | AnyRecord} [env]
 * @returns {string}
 */
function getWorkerToken(env = process.env) {
  return (
    env.SOUNDING_WORKER_INDEX ||
    env.PLAYWRIGHT_WORKER_INDEX ||
    env.TEST_WORKER_INDEX ||
    String(process.pid)
  )
}

/**
 * @param {{
 *   root?: string,
 *   identity?: string,
 *   isolation?: string,
 *   env?: NodeJS.ProcessEnv | AnyRecord,
 * }} options
 * @returns {string}
 */
function buildManagedSqlitePath({
  root = path.join(process.cwd(), '.tmp', 'db'),
  identity = 'default',
  isolation = 'worker',
  env = process.env,
}) {
  const workerToken = isolation === 'run' ? 'run' : `worker-${getWorkerToken(env)}`
  return path.join(root, identity, `${workerToken}.db`)
}

/**
 * @param {{ sails?: SoundingSailsApp, datastore?: AnyRecord, appPath?: string }} options
 * @returns {string}
 */
function resolveManagedRoot({ sails, datastore = {}, appPath } = {}) {
  const configuredRoot = datastore.root || path.join('.tmp', 'db')

  if (path.isAbsolute(configuredRoot)) {
    return configuredRoot
  }

  return path.resolve(appPath || sails?.config?.appPath || process.cwd(), configuredRoot)
}

/**
 * @param {{ sails: SoundingSailsApp, soundingConfig: SoundingConfig }} input
 * @returns {SoundingDatastoreState & { managed: boolean, filePath?: string }}
 */
function resolveDatastore({ sails, soundingConfig }) {
  /** @type {AnyRecord} */
  const datastoreConfig = soundingConfig.datastore || {}
  const mode = datastoreConfig.mode || 'managed'
  const identity = datastoreConfig.identity || 'default'
  const datastores = (sails.config.datastores ||= {})

  if (mode === 'inherit' || mode === 'external') {
    const configuredDatastore = datastores[identity]

    if (!configuredDatastore) {
      throw createSoundingError({
        code: 'E_SOUNDING_DATASTORE_CONFIG_MISSING',
        message: `Sounding could not find datastore \`${identity}\` in sails.config.datastores for mode \`${mode}\`.`,
        details: {
          mode,
          identity,
        },
      })
    }

    return {
      mode,
      identity,
      config: { ...configuredDatastore },
      managed: false,
    }
  }

  if (mode === 'managed') {
    const adapter = datastoreConfig.adapter || 'sails-sqlite'

    if (adapter !== 'sails-sqlite') {
      throw createSoundingError({
        code: 'E_SOUNDING_DATASTORE_ADAPTER_UNSUPPORTED',
        message: `Sounding only supports managed adapter \`sails-sqlite\` in v0.0.1. Received \`${adapter}\`.`,
        details: {
          adapter,
        },
      })
    }

    const filePath = buildManagedSqlitePath({
      root: resolveManagedRoot({
        sails,
        datastore: datastoreConfig,
      }),
      identity,
      isolation: datastoreConfig.isolation || 'worker',
    })

    const nextDatastore = {
      ...(datastores[identity] || {}),
      adapter,
      url: filePath,
    }

    datastores[identity] = nextDatastore

    return {
      mode,
      identity,
      config: { ...nextDatastore },
      managed: true,
      filePath,
    }
  }

  throw createSoundingError({
    code: 'E_SOUNDING_DATASTORE_MODE_UNKNOWN',
    message: `Unknown Sounding datastore mode: ${mode}`,
    details: {
      mode,
    },
  })
}

module.exports = {
  buildManagedSqlitePath,
  resolveManagedRoot,
  resolveDatastore,
}
