const DEFAULT_CONFIG = Object.freeze({
  app: {
    path: '.',
    environment: 'test',
    quiet: true,
    liftOptions: {},
  },
  world: {
    factories: 'tests/factories',
    scenarios: 'tests/scenarios',
  },
  datastore: {
    mode: 'managed',
    identity: 'default',
    adapter: 'sails-sqlite',
    root: '.tmp/db',
    isolation: 'worker',
  },
  browser: {
    enabled: true,
    type: 'chromium',
    projects: ['desktop'],
    defaultProject: 'desktop',
    launchOptions: {
      headless: true,
    },
  },
  mail: {
    capture: true,
  },
  request: {
    transport: 'virtual',
  },
  auth: {
    defaultActor: 'guest',
  },
})

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)])
    )
  }

  return value
}

function getDefaultConfig() {
  return cloneValue(DEFAULT_CONFIG)
}

module.exports = {
  DEFAULT_CONFIG,
  getDefaultConfig,
}
