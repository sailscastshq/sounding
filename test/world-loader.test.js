const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createWorldEngine } = require('../lib/create-world-engine')
const { createWorldLoaderCache, loadWorldFiles } = require('../lib/create-world-loader')

let moduleTimestamp = Date.now()

function writeModule(filePath, source, options = {}) {
  fs.writeFileSync(filePath, source)

  moduleTimestamp += 2000
  const timestamp = new Date(moduleTimestamp)
  fs.utimesSync(filePath, timestamp, timestamp)

  if (options.touchDirectory) {
    fs.utimesSync(path.dirname(filePath), timestamp, timestamp)
  }
}

function createWorldLoadInput(tempRoot, cache) {
  const world = createWorldEngine({ sails: {} })

  return {
    world,
    input: {
      world,
      appPath: tempRoot,
      config: {
        world: {
          factories: 'tests/factories',
          scenarios: 'tests/scenarios',
        },
      },
      sails: {},
      cache,
    },
  }
}

test('loadWorldFiles discovers factory and scenario definitions from tests/', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-worlds-'))
  const factoriesDir = path.join(tempRoot, 'tests', 'factories')
  const scenariosDir = path.join(tempRoot, 'tests', 'scenarios')

  fs.mkdirSync(factoriesDir, { recursive: true })
  fs.mkdirSync(scenariosDir, { recursive: true })

  fs.writeFileSync(
    path.join(factoriesDir, 'user.js'),
    "module.exports = ({ factory }) => factory('user', ({ sequence }) => ({ email: sequence('user', (n) => `user${n}@example.com`) })).trait('subscriber', { role: 'subscriber' })\n"
  )

  fs.writeFileSync(
    path.join(scenariosDir, 'issue-access.js'),
    "module.exports = ({ scenario }) => scenario('issue-access', async ({ create }) => { const subscriber = await create('user').trait('subscriber'); return { users: { subscriber } }; })\n"
  )

  const world = createWorldEngine({ sails: {} })
  const loaded = await loadWorldFiles({
    world,
    appPath: tempRoot,
    config: {
      world: {
        factories: 'tests/factories',
        scenarios: 'tests/scenarios',
      },
    },
    sails: {},
  })

  assert.equal(loaded.length, 2)
  assert.deepEqual(world.factories, ['user'])
  assert.deepEqual(world.scenarios, ['issue-access'])

  const current = await world.use('issue-access')
  assert.equal(current.users.subscriber.role, 'subscriber')
  assert.match(current.users.subscriber.email, /^user\d+@example.com$/)
})

test('loadWorldFiles reuses cached directory scans and module loads for unchanged worlds', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-worlds-'))
  const factoriesDir = path.join(tempRoot, 'tests', 'factories')
  const scenariosDir = path.join(tempRoot, 'tests', 'scenarios')

  fs.mkdirSync(factoriesDir, { recursive: true })
  fs.mkdirSync(scenariosDir, { recursive: true })

  for (let index = 0; index < 12; index += 1) {
    writeModule(
      path.join(factoriesDir, `entity-${index}.js`),
      `module.exports = ({ factory }) => factory('entity${index}', { index: ${index} })\n`
    )
  }

  for (let index = 0; index < 8; index += 1) {
    writeModule(
      path.join(scenariosDir, `scenario-${index}.js`),
      `module.exports = ({ scenario }) => scenario('scenario${index}', () => ({ index: ${index} }))\n`
    )
  }

  const cache = createWorldLoaderCache()
  const first = createWorldLoadInput(tempRoot, cache)
  const firstLoaded = await loadWorldFiles(first.input)

  assert.equal(firstLoaded.length, 20)
  assert.equal(cache.stats.directoryScans, 2)
  assert.equal(cache.stats.moduleLoads, 20)
  assert.equal(first.world.factories.length, 12)
  assert.equal(first.world.scenarios.length, 8)

  const second = createWorldLoadInput(tempRoot, cache)
  const secondLoaded = await loadWorldFiles(second.input)

  assert.equal(secondLoaded.length, 20)
  assert.equal(cache.stats.directoryScans, 2)
  assert.equal(cache.stats.moduleLoads, 20)
  assert.deepEqual(second.world.build('entity4'), { index: 4 })
})

test('loadWorldFiles invalidates changed modules, changed directories, and explicit cache clears', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-worlds-'))
  const factoriesDir = path.join(tempRoot, 'tests', 'factories')
  const scenariosDir = path.join(tempRoot, 'tests', 'scenarios')
  const userFactory = path.join(factoriesDir, 'user.js')

  fs.mkdirSync(factoriesDir, { recursive: true })
  fs.mkdirSync(scenariosDir, { recursive: true })

  writeModule(
    userFactory,
    "module.exports = ({ factory }) => factory('user', { role: 'reader' })\n"
  )
  writeModule(
    path.join(scenariosDir, 'member-access.js'),
    "module.exports = ({ scenario }) => scenario('member-access', ({ build }) => ({ user: build('user') }))\n"
  )

  const cache = createWorldLoaderCache()
  const first = createWorldLoadInput(tempRoot, cache)
  await loadWorldFiles(first.input)

  assert.equal(cache.stats.directoryScans, 2)
  assert.equal(cache.stats.moduleLoads, 2)
  assert.deepEqual(first.world.build('user'), { role: 'reader' })

  const unchanged = createWorldLoadInput(tempRoot, cache)
  await loadWorldFiles(unchanged.input)

  assert.equal(cache.stats.directoryScans, 2)
  assert.equal(cache.stats.moduleLoads, 2)

  writeModule(
    userFactory,
    "module.exports = ({ factory }) => factory('user', { role: 'writer' })\n"
  )

  const changedModule = createWorldLoadInput(tempRoot, cache)
  await loadWorldFiles(changedModule.input)

  assert.equal(cache.stats.directoryScans, 2)
  assert.equal(cache.stats.moduleLoads, 3)
  assert.deepEqual(changedModule.world.build('user'), { role: 'writer' })

  writeModule(
    path.join(scenariosDir, 'admin-access.js'),
    "module.exports = ({ scenario }) => scenario('admin-access', () => ({ role: 'admin' }))\n",
    { touchDirectory: true }
  )

  const changedDirectory = createWorldLoadInput(tempRoot, cache)
  await loadWorldFiles(changedDirectory.input)

  assert.equal(cache.stats.directoryScans, 3)
  assert.equal(cache.stats.moduleLoads, 4)
  assert.deepEqual(changedDirectory.world.scenarios.sort(), ['admin-access', 'member-access'])

  cache.clear()
  const afterClear = createWorldLoadInput(tempRoot, cache)
  await loadWorldFiles(afterClear.input)

  assert.equal(cache.stats.directoryScans, 2)
  assert.equal(cache.stats.moduleLoads, 3)
})

test('createWorldEngine builders merge overrides and keep withOnly available', async () => {
  const world = createWorldEngine({ sails: {} })

  world.defineFactory('user', ({ sequence }) => ({
    email: sequence('user', (number) => `user${number}@example.com`),
    fullName: 'Test User',
    role: 'reader',
  }))

  world.defineScenario('team-access', async ({ create }) => {
    const member = await create('user')
      .with({ email: 'member@example.com' })
      .with({ role: 'member' })

    const replacement = await create('user')
      .with({ email: 'ignored@example.com' })
      .withOnly({ role: 'admin' })

    return {
      users: {
        member,
        replacement,
      },
    }
  })

  const current = await world.use('team-access')

  assert.deepEqual(current.users.member, {
    email: 'member@example.com',
    fullName: 'Test User',
    role: 'member',
  })
  assert.deepEqual(current.users.replacement, {
    email: 'user2@example.com',
    fullName: 'Test User',
    role: 'admin',
  })
})

test('createWorldEngine function traits merge into the base record', () => {
  const world = createWorldEngine({ sails: {} })

  world.defineFactory('user', {
    email: 'reader@example.com',
    fullName: 'Reader Example',
    role: 'reader',
  }).trait('verified', (user) => ({
    emailVerificationCode: `${user.role}-verified`,
    emailVerifiedAt: '2026-06-15T00:00:00.000Z',
  }))

  const user = world.build('user', {}, { traits: ['verified'] })

  assert.deepEqual(user, {
    email: 'reader@example.com',
    fullName: 'Reader Example',
    role: 'reader',
    emailVerificationCode: 'reader-verified',
    emailVerifiedAt: '2026-06-15T00:00:00.000Z',
  })
})

test('createWorldEngine supports fluent traits on top-level create', async () => {
  const created = []
  const world = createWorldEngine({
    sails: {
      models: {
        user: {
          create(value) {
            return {
              fetch() {
                const record = {
                  id: created.length + 1,
                  ...value,
                }

                created.push(record)
                return record
              },
            }
          },
        },
      },
    },
  })

  world.defineFactory('user', {
    email: 'reader@example.com',
    fullName: 'Reader Example',
    role: 'reader',
  }).trait('admin', {
    role: 'admin',
  })

  const admin = await world
    .create('user')
    .trait('admin')
    .with({ email: 'admin@example.com' })

  assert.deepEqual(admin, {
    id: 1,
    email: 'admin@example.com',
    fullName: 'Reader Example',
    role: 'admin',
  })
  assert.deepEqual(created, [admin])
})

test('createWorldEngine reports unknown world entries with stable codes', async () => {
  const world = createWorldEngine({ sails: {} })
  world.defineFactory('account', {
    name: 'Acme',
  })
  world.defineScenario('signed-in-user', async () => ({}))

  assert.throws(
    () => {
      world.build('user')
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_WORLD_FACTORY_UNKNOWN')
      assert.equal(error.factory, 'user')
      assert.deepEqual(error.availableFactories, ['account'])
      assert.match(error.message, /Available factories: account/)
      return true
    }
  )

  world.defineFactory('user', {
    email: 'reader@example.com',
  }).trait('verified', {
    verified: true,
  })

  assert.throws(
    () => {
      world.build('user', {}, { traits: ['admin'] })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_WORLD_TRAIT_UNKNOWN')
      assert.equal(error.factory, 'user')
      assert.equal(error.trait, 'admin')
      assert.deepEqual(error.availableTraits, ['verified'])
      assert.match(error.message, /Available traits for `user`: verified/)
      return true
    }
  )

  await assert.rejects(
    async () => {
      await world.use('missing-dashboard')
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_WORLD_SCENARIO_UNKNOWN')
      assert.equal(error.scenario, 'missing-dashboard')
      assert.deepEqual(error.availableScenarios, ['signed-in-user'])
      assert.match(error.message, /Available scenarios: signed-in-user/)
      return true
    }
  )

  assert.throws(
    () => {
      world.register({})
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_WORLD_DEFINITION_UNKNOWN')
      return true
    }
  )
})

test('loadWorldFiles reports unknown world file exports with a stable code', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-worlds-'))
  const factoriesDir = path.join(tempRoot, 'tests', 'factories')

  fs.mkdirSync(factoriesDir, { recursive: true })
  const source = path.join(factoriesDir, 'invalid.js')
  fs.writeFileSync(source, 'module.exports = 42\n')

  const world = createWorldEngine({ sails: {} })

  await assert.rejects(
    async () => {
      await loadWorldFiles({
        world,
        appPath: tempRoot,
        config: {
          world: {
            factories: 'tests/factories',
          },
        },
        sails: {},
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_WORLD_DEFINITION_UNKNOWN')
      assert.equal(error.source, source)
      return true
    }
  )
})
