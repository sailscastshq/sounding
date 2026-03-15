const path = require('node:path')

function getWorkerToken(env = process.env) {
  return (
    env.SOUNDING_WORKER_INDEX ||
    env.PLAYWRIGHT_WORKER_INDEX ||
    env.TEST_WORKER_INDEX ||
    String(process.pid)
  )
}

function buildManagedSqlitePath({
  root = path.join(process.cwd(), '.tmp', 'db'),
  identity = 'default',
  isolation = 'worker',
  env = process.env,
}) {
  const workerToken = isolation === 'run' ? 'run' : `worker-${getWorkerToken(env)}`
  return path.join(root, identity, `${workerToken}.db`)
}

function resolveManagedRoot({ sails, datastore = {}, appPath } = {}) {
  const configuredRoot = datastore.root || path.join('.tmp', 'db')

  if (path.isAbsolute(configuredRoot)) {
    return configuredRoot
  }

  return path.resolve(appPath || sails?.config?.appPath || process.cwd(), configuredRoot)
}

function resolveDatastore({ sails, soundingConfig }) {
  const datastoreConfig = soundingConfig.datastore || {}
  const mode = datastoreConfig.mode || 'managed'
  const identity = datastoreConfig.identity || 'default'
  const datastores = (sails.config.datastores ||= {})

  if (mode === 'inherit' || mode === 'external') {
    const configuredDatastore = datastores[identity]

    if (!configuredDatastore) {
      throw new Error(
        `Sounding could not find datastore \`${identity}\` in sails.config.datastores for mode \`${mode}\`.`
      )
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
      throw new Error(
        `Sounding only supports managed adapter \`sails-sqlite\` in v0.0.1. Received \`${adapter}\`.`
      )
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

  throw new Error(`Unknown Sounding datastore mode: ${mode}`)
}

module.exports = {
  buildManagedSqlitePath,
  resolveManagedRoot,
  resolveDatastore,
}
