const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  createPluginManager,
  discoverDependencyPluginNames,
  discoverPluginSpecs,
} = require('../lib/create-plugin-manager')

function createTempApp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-plugins-'))
}

function createChildEnv() {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return env
}

test('discoverDependencyPluginNames finds Sounding plugins in package dependencies', () => {
  assert.deepEqual(
    discoverDependencyPluginNames({
      dependencies: {
        'sounding-plugin-stress': '^0.1.0',
        express: '^5.0.0',
      },
      devDependencies: {
        '@sounding/plugin-mutation': '^0.1.0',
        '@types/node': '^25.0.0',
      },
    }),
    ['@sounding/plugin-mutation', 'sounding-plugin-stress']
  )
})

test('discoverPluginSpecs finds local monorepo plugin packages', () => {
  const appPath = createTempApp()
  const pluginPath = path.join(appPath, 'plugins', 'stress')

  fs.mkdirSync(pluginPath, { recursive: true })
  fs.writeFileSync(
    path.join(pluginPath, 'package.json'),
    JSON.stringify({
      name: 'sounding-plugin-stress',
      main: 'index.js',
    })
  )

  assert.deepEqual(discoverPluginSpecs(appPath), [
    {
      name: 'sounding-plugin-stress',
      localPath: path.join(pluginPath, 'index.js'),
    },
  ])
})

test('createPluginManager exposes plugin commands, test methods, events, and trial context', async () => {
  const events = []
  const plugin = {
    name: 'fixture',
    commands: {
      fixture: () => ({ status: 0 }),
    },
    testMethods: {
      fixture: {
        mode: 'fixture',
      },
    },
    trial({ title, events: eventBus }) {
      eventBus.emit('fixture:trial', title)
      return {
        fixtureHelper: title,
      }
    },
  }
  const manager = createPluginManager({
    plugins: [plugin],
  })

  manager.events.on('trial:plugin:before', (entry) => events.push(['before', entry.plugin.name]))
  manager.events.on('trial:plugin:after', (entry) => events.push(['after', entry.keys]))
  manager.events.on('fixture:trial', (title) => events.push(['fixture', title]))

  assert.equal(manager.command('fixture').plugin, plugin)
  assert.deepEqual(manager.testMethods()[0].name, 'fixture')
  assert.deepEqual(await manager.trialContext({ title: 'runs fixture plugin' }), {
    fixtureHelper: 'runs fixture plugin',
  })
  assert.deepEqual(events, [
    ['before', 'fixture'],
    ['fixture', 'runs fixture plugin'],
    ['after', ['fixtureHelper']],
  ])
})

test('bin/sounding.js gives a setup hint when the stress plugin is missing', () => {
  const appPath = createTempApp()
  fs.writeFileSync(path.join(appPath, 'package.json'), JSON.stringify({ name: 'empty-app' }))

  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'bin', 'sounding.js'), 'stress', '--app', appPath, '--help'],
    { cwd: appPath, env: createChildEnv() }
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr.toString(), /sounding-plugin-stress/)
  assert.match(result.stderr.toString(), /npm install -D sounding-plugin-stress/)
})
