// Unreleased local plugin demo. Run through: node examples/hooks/run-plugin-demo.js
const { test } = require('sounding')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { after } = require('node:test')
const fixtures = []
let firstHook

test('loads the real hook and furnishes fetch', async ({ sails, hook, hookApp, expect }) => {
  fixtures.push(hookApp.appPath)
  firstHook = hook
  expect(hook.name).toBe('node-fetch')
  expect(hook).toBe(sails.hooks['node-fetch'])
  expect(sails.helpers.fetch.with).toBeDefined()
  assert.equal(sails.hooks.http, undefined)
  firstHook.demoMutation = true
  if (process.env.SOUNDING_DEMO_FAIL === '1') throw new Error('Intentional hook demo failure')
})

test(
  'isolates hook state and applies fixture config',
  {
    hook: { config: { demo: { enabled: false } } },
  },
  async ({ sails, hook, hookApp, expect }) => {
    fixtures.push(hookApp.appPath)
    assert.notEqual(hook, firstHook)
    expect(hook.demoMutation).toBe(undefined)
    expect(sails.config.demo.enabled).toBe(false)
  }
)

after(() => {
  for (const fixture of fixtures) assert.equal(fs.existsSync(fixture), false)
})
