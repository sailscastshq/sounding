// Run: SOUNDING_HOOK_ROOT=/path/to/sails-hook-node-fetch node --test examples/hooks/node-fetch.test.js
// Uses a real hook package, real Sails, no outbound requests, and no production app.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAppManager, createTestApi } = require('../..')

const hookRoot = process.env.SOUNDING_HOOK_ROOT
if (!hookRoot) throw new Error('Set SOUNDING_HOOK_ROOT to a local sails-hook-node-fetch checkout.')
const hookFactory = require(path.resolve(hookRoot))

function fixture() {
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-hook-demo-'))
  fs.mkdirSync(path.join(appPath, 'config'))
  fs.writeFileSync(path.join(appPath, 'package.json'), '{"name":"hook-demo","private":true}')
  fs.writeFileSync(path.join(appPath, 'config/sounding.js'), `module.exports.sounding = {
    datastore: 'inherit', app: { quiet: false }
  }`)
  return appPath
}

test('real node-fetch hook: isolated lifecycle, overrides, helper furnishing', async (t) => {
  const appPath = fixture()
  const manager = createAppManager({
    appPath, SailsConstructor: require('sails').Sails,
    loadOptions: {
      datastores: { default: { adapter: 'unused', url: 'unused' } },
      globals: false, log: { level: 'silent' },
      loadHooks: ['moduleloader', 'userconfig', 'helpers', 'node-fetch', 'sounding'],
      hooks: { 'node-fetch': hookFactory, sounding: require('../..') },
    },
  })
  t.after(async () => {
    try { await manager.lower() }
    finally { fs.rmSync(appPath, { recursive: true, force: true }) }
  })
  // createTestApi provides the normal Sounding trial context and runtime cleanup.
  const trial = createTestApi({ baseTest: t.test.bind(t), runtime: () => manager.runtime() })
  let firstHook
  await trial('furnishes the real helper without starting HTTP', async ({ sails, expect }) => {
    firstHook = sails.hooks['node-fetch']
    expect(firstHook.identity).toBe('node-fetch')
    expect(sails.helpers.fetch.with).toBeDefined()
    assert.equal(sails.hooks.http, undefined)
    assert.equal(sails.config.globals, false)
    firstHook.demoMutation = true
  })
  await manager.load({ reload: true })
  await trial('reload discards hook state', async ({ sails, expect }) => {
    expect(sails.hooks['node-fetch'].demoMutation).toBe(undefined)
    assert.notEqual(sails.hooks['node-fetch'], firstHook)
    expect(sails.helpers.fetch.with).toBeDefined()
  })
})
