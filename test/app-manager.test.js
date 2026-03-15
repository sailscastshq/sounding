const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createAppManager,
  loadAppSoundingConfig,
} = require('../lib/create-app-manager')

test('loadAppSoundingConfig falls back to Sounding defaults when the app has no config/sounding.js', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-config-'))
  const config = loadAppSoundingConfig(tempRoot)

  assert.equal(config.datastore.mode, 'managed')
  assert.equal(config.app.environment, 'test')
})

test('loadAppSoundingConfig normalizes shorthand and legacy datastore config', () => {
  const shorthandRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-config-'))
  fs.mkdirSync(path.join(shorthandRoot, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(shorthandRoot, 'config', 'sounding.js'),
    "module.exports.sounding = { datastore: 'inherit' }\n"
  )

  const shorthandConfig = loadAppSoundingConfig(shorthandRoot)
  assert.equal(shorthandConfig.datastore.mode, 'inherit')
  assert.equal(shorthandConfig.datastore.root, '.tmp/db')

  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-config-'))
  fs.mkdirSync(path.join(legacyRoot, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(legacyRoot, 'config', 'sounding.js'),
    "module.exports.sounding = { datastore: { managed: { directory: '.tmp/legacy-db' } } }\n"
  )

  const legacyConfig = loadAppSoundingConfig(legacyRoot)
  assert.equal(legacyConfig.datastore.mode, 'managed')
  assert.equal(legacyConfig.datastore.root, '.tmp/legacy-db')
})

test('createAppManager loads consumer apps by default and disables shipwright for virtual trials', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-manager-'))
  fs.mkdirSync(path.join(tempRoot, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(tempRoot, 'config', 'sounding.js'),
    "module.exports.sounding = { datastore: 'inherit', app: { environment: 'test' } }\n"
  )

  const runtime = { boot: async () => ({ sails: {} }), lower: async () => {} }
  const loadCalls = []
  const liftCalls = []

  class FakeSails {
    load(options, done) {
      loadCalls.push(options)
      this.config = { appPath: tempRoot }
      this.sounding = runtime
      this.hooks = { sounding: runtime }
      done(undefined, this)
    }

    lift(options, done) {
      liftCalls.push(options)
      this.config = { appPath: tempRoot }
      this.sounding = runtime
      this.hooks = { sounding: runtime }
      done(undefined, this)
    }

    lower(done) {
      done()
    }
  }

  const manager = createAppManager({
    appPath: tempRoot,
    SailsConstructor: FakeSails,
  })

  const resolvedRuntime = await manager.runtime()
  assert.equal(resolvedRuntime, runtime)
  assert.equal(loadCalls[0].environment, 'test')
  assert.equal(loadCalls[0].hooks.shipwright, false)
  assert.equal(loadCalls[0].datastores, undefined)
  assert.equal(liftCalls.length, 0)

  const liftedRuntime = await manager.runtime({ http: true })
  assert.equal(liftedRuntime, runtime)
  assert.equal(liftCalls[0].environment, 'test')

  await manager.lower()
})

test('createAppManager suppresses noisy app boot logs when quiet mode is enabled', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-quiet-'))
  fs.mkdirSync(path.join(tempRoot, 'config'), { recursive: true })

  const captured = []
  const originalWrite = process.stdout.write
  process.stdout.write = function soundingCapture(chunk, encoding, callback) {
    captured.push(String(chunk || ''))

    if (typeof encoding === 'function') {
      encoding()
    }

    if (typeof callback === 'function') {
      callback()
    }

    return true
  }

  class FakeSails {
    load(options, done) {
      this.config = { appPath: tempRoot }
      this.sounding = { lower: async () => {}, boot: async () => ({ sails: this }) }
      this.hooks = { sounding: this.sounding }
      process.stdout.write(' info: Initializing custom hook (`quest`)...\n')
      process.stdout.write("{ success: true, message: 'No new issues to notify' }\n")
      process.stdout.write('A real application log we should keep.\n')
      done(undefined, this)
    }

    lower(done) {
      done()
    }
  }

  try {
    const manager = createAppManager({
      appPath: tempRoot,
      SailsConstructor: FakeSails,
    })

    await manager.runtime()
    await manager.lower()
  } finally {
    process.stdout.write = originalWrite
  }

  assert.equal(captured.some((line) => line.includes('Initializing custom hook')), false)
  assert.equal(captured.some((line) => line.includes('No new issues to notify')), false)
  assert.equal(captured.some((line) => line.includes('A real application log we should keep.')), true)
})
