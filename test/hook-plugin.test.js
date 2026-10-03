const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createTestApi } = require('..')
const { createPluginManager } = require('../lib/create-plugin-manager')
const { splitTestOptions } = require('../lib/validate-test-args')

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-hook-package-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  fs.symlinkSync(path.resolve('.'), path.join(root, 'node_modules/sounding'), 'dir')
  fs.symlinkSync(
    path.dirname(require.resolve('sails/package.json')),
    path.join(root, 'node_modules/sails'),
    'dir'
  )
  fs.cpSync(path.resolve('plugins/hook'), path.join(root, 'node_modules/sounding-plugin-hook'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: '@fixture/sails-hook-probe',
      main: 'index.js',
      sails: { isHook: true, hookName: 'probe' },
      devDependencies: { 'sounding-plugin-hook': '0.0.0' },
    })
  )
  fs.writeFileSync(
    path.join(root, 'index.js'),
    `module.exports=sails=>({defaults:{probe:{value:1}},initialize(done){done()}})`
  )
  return root
}

const immediateTest = (name, options, fn) => fn({ name })

test('plugin options stay out of Node options and reject competing claims', () => {
  const split = splitTestOptions({ hook: { name: 'probe' }, timeout: 100 }, 'test', ['hook'])
  assert.deepEqual(split.trialOptions.hook, { name: 'probe' })
  assert.equal(split.nodeOptions.hook, undefined)
  assert.equal(split.nodeOptions.timeout, 100)
  assert.throws(
    () =>
      createPluginManager({
        plugins: [{ trialOptions: ['hook'] }, { trialOptions: ['hook'] }],
      }).trialOptionKeys(),
    (error) => error.code === 'E_SOUNDING_PLUGIN_OPTION_CONFLICT'
  )
})

test('installed plugin discovers package metadata with unchanged sounding test import', (t) => {
  const root = project(t)
  fs.mkdirSync(path.join(root, 'config'))
  fs.writeFileSync(
    path.join(root, 'config/sounding.js'),
    `module.exports.sounding={hook:{config:{probe:{value:2}}}}`
  )
  fs.writeFileSync(
    path.join(root, 'test.js'),
    `
    const {test}=require('sounding')
    const assert=require('node:assert/strict'),fs=require('node:fs')
    const {after}=require('node:test')
    const fixtures=[]
    let first
    test('loads inferred hook',async({sails,hook,hookApp,expect})=>{
      fixtures.push(hookApp.appPath); first=hook
      expect(hook.name).toBe('probe');expect(hook).toBe(sails.hooks.probe)
      expect(sails.config.probe.value).toBe(2);assert.equal(sails.config.globals,false)
      hook.mutated=true
    })
    test.it('per-trial config and fresh hook', {hook:{config:{probe:{value:3}}}},async({sails,hook,hookApp,expect})=>{
      fixtures.push(hookApp.appPath);assert.notEqual(hook,first)
      expect(hook.mutated).toBe(undefined);expect(sails.config.probe.value).toBe(3)
    })
    after(()=>{for(const fixture of fixtures)assert.equal(fs.existsSync(fixture),false)})
  `
  )
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ['--test', 'test.js'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 10000,
  })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /pass 2/)
})

test('generated fixture files and HTTP promotion use real Sails routes and close listener', async (t) => {
  const root = project(t)
  const trial = createTestApi({ baseTest: immediateTest, projectPath: root })
  let fixture, server
  await trial(
    'real hook HTTP',
    {
      transport: 'http',
      hook: {
        files: {
          'config/routes.js':
            "module.exports.routes={'GET /hook-health':(req,res)=>res.json({hook:'probe'})}",
        },
      },
    },
    async ({ sails, hook, hookApp, get }) => {
      fixture = hookApp.appPath
      server = sails.hooks.http.server
      assert.equal(hook, sails.hooks.probe)
      const response = await get('/hook-health')
      assert.equal(response.status, 200)
      assert.deepEqual(response.data, { hook: 'probe' })
    }
  )
  assert.equal(server.listening, false)
  assert.equal(fs.existsSync(fixture), false)
  const failure = new Error('HTTP handler sentinel')
  await assert.rejects(
    trial('failed HTTP hook trial', { transport: 'http' }, async ({ sails, hookApp }) => {
      fixture = hookApp.appPath
      server = sails.hooks.http.server
      throw failure
    }),
    (error) => error === failure
  )
  assert.equal(server.listening, false)
  assert.equal(fs.existsSync(fixture), false)
})

test('handler and boot failures clean fixtures; traversal and shared concurrent hooks reject', async (t) => {
  const root = project(t)
  const trial = createTestApi({ baseTest: immediateTest, projectPath: root })
  let fixture
  const failure = new Error('handler sentinel')
  await assert.rejects(
    trial('failed trial', async ({ hookApp }) => {
      fixture = hookApp.appPath
      throw failure
    }),
    (error) => error === failure
  )
  assert.equal(fs.existsSync(fixture), false)
  await assert.rejects(
    trial('unsafe file', { hook: { files: { '../escape': 'sentinel' } } }, () => {}),
    (error) => error.code === 'E_SOUNDING_HOOK_FIXTURE_PATH'
  )
  await assert.rejects(
    trial.concurrent('unsafe sharing', () => {}),
    (error) => error.code === 'E_SOUNDING_HOOK_CONCURRENCY'
  )
  await assert.rejects(
    trial('unsupported mount', { hook: { mount: 'package' } }, () => {}),
    (error) => error.code === 'E_SOUNDING_HOOK_MOUNT_UNSUPPORTED'
  )
  const pluginManager = createPluginManager({ appPath: root })
  const prepared = await pluginManager.prepareApp({
    options: {
      hook: {
        config: { hooks: { helpers: false } },
        module: (sails) => ({
          initialize(done) {
            done(new Error('boot sentinel'))
          },
        }),
      },
    },
  })
  const bootFixture = prepared.context.hookApp.appPath
  try {
    await assert.rejects(prepared.runtime(), /boot sentinel/)
  } finally {
    await prepared.cleanup()
  }
  assert.equal(fs.existsSync(bootFixture), false)
})

test('runtime preparation closes owned fixture after boot failure and preserves cleanup failure', async () => {
  const bootFailure = new Error('runtime boot sentinel')
  const cleanupFailure = new Error('cleanup sentinel')
  let cleaned = 0
  const runtime = {
    boot: async () => {
      throw bootFailure
    },
    lower: async () => {
      cleaned++
    },
  }
  const trial = createTestApi({
    baseTest: immediateTest,
    plugins: [
      {
        trialOptions: ['probe'],
        prepareApp: async () => ({
          runtime,
          cleanup: async () => {
            throw cleanupFailure
          },
        }),
      },
    ],
  })
  await assert.rejects(
    trial('both failures', () => {}),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === bootFailure &&
      error.errors[1] === cleanupFailure
  )
  assert.equal(cleaned, 1)
})

test('multiple runtime owners are rejected and both prepared fixtures are cleaned', async () => {
  const closed = []
  const manager = createPluginManager({
    plugins: ['first', 'second'].map((name) => ({
      prepareApp: async () => ({
        runtime: { boot: async () => {}, lower: async () => {} },
        cleanup: async () => {
          closed.push(name)
        },
      }),
    })),
  })
  await assert.rejects(
    manager.prepareApp({}),
    (error) => error.code === 'E_SOUNDING_PLUGIN_RUNTIME_CONFLICT'
  )
  assert.deepEqual(closed, ['second', 'first'])
})

test('scoped package identity fallback and read-only name preserve canonical hook identity', async (t) => {
  const root = project(t)
  const pkgPath = path.join(root, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  delete pkg.sails.hookName
  fs.writeFileSync(pkgPath, JSON.stringify(pkg))
  const trial = createTestApi({ baseTest: immediateTest, projectPath: root })
  await trial('inferred name', async ({ sails, hook }) => {
    assert.equal(hook.name, 'probe')
    assert.equal(hook, sails.hooks[hook.name])
    assert.equal(hook, sails.hooks[hook.identity])
    assert.equal(Object.getOwnPropertyDescriptor(hook, 'name').writable, false)
  })
})

test('invalid prepared runtime is rejected after releasing its owned fixture', async () => {
  let cleaned = 0
  const manager = createPluginManager({
    plugins: [
      {
        prepareApp: async () => ({
          runtime: {},
          cleanup: async () => {
            cleaned++
          },
        }),
      },
    ],
  })
  await assert.rejects(
    manager.prepareApp({}),
    (error) => error.code === 'E_SOUNDING_PLUGIN_PREPARE_INVALID'
  )
  assert.equal(cleaned, 1)
})
