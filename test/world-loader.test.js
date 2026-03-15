const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createWorldEngine } = require('../lib/create-world-engine')
const { loadWorldFiles } = require('../lib/create-world-loader')

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
