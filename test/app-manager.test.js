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

test('loadAppSoundingConfig normalizes shorthand datastore config', () => {
  const shorthandRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-config-'))
  fs.mkdirSync(path.join(shorthandRoot, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(shorthandRoot, 'config', 'sounding.js'),
    "module.exports.sounding = { datastore: 'inherit' }\n"
  )

  const shorthandConfig = loadAppSoundingConfig(shorthandRoot)
  assert.equal(shorthandConfig.datastore.mode, 'inherit')
  assert.equal(shorthandConfig.datastore.root, '.tmp/db')
})

test('loadAppSoundingConfig rejects legacy datastore config with a migration hint', () => {
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-config-'))
  fs.mkdirSync(path.join(legacyRoot, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(legacyRoot, 'config', 'sounding.js'),
    "module.exports.sounding = { datastore: { managed: { directory: '.tmp/legacy-db' } } }\n"
  )

  assert.throws(
    () => {
      loadAppSoundingConfig(legacyRoot)
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.datastore.managed')
      assert.equal(
        error.suggestion,
        'Use `datastore: { mode: \'managed\', root: ".tmp/legacy-db" }` instead.'
      )
      return true
    }
  )
})

test('loadAppSoundingConfig reports invalid app config with stable codes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-config-'))
  fs.mkdirSync(path.join(tempRoot, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(tempRoot, 'config', 'sounding.js'),
    "module.exports.sounding = { browser: { type: 'safari' } }\n"
  )

  assert.throws(
    () => {
      loadAppSoundingConfig(tempRoot)
    },
    (error) => {
      assert.equal(error.name, 'SoundingConfigError')
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.browser.type')
      assert.equal(error.value, 'safari')
      assert.deepEqual(error.allowed, ['chromium', 'firefox', 'webkit'])
      return true
    }
  )
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

  const liftedRuntime = await manager.runtime({ app: 'lift' })
  assert.equal(liftedRuntime, runtime)
  assert.equal(liftCalls[0].environment, 'test')

  await manager.lower()
})

test('createAppManager exposes explicit load, lift, reload, and lifecycle timing controls', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-app-manager-'))
  fs.mkdirSync(path.join(tempRoot, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(tempRoot, 'config', 'sounding.js'),
    "module.exports.sounding = { datastore: 'inherit', app: { environment: 'test' } }\n"
  )

  const loadCalls = []
  const liftCalls = []
  const lowerCalls = []

  class FakeSails {
    load(options, done) {
      loadCalls.push(options)
      this.config = { appPath: tempRoot }
      this.sounding = {
        id: `load-${loadCalls.length}`,
        boot: async () => ({ sails: this }),
        lower: async () => {},
      }
      this.hooks = { sounding: this.sounding }
      done(undefined, this)
    }

    lift(options, done) {
      liftCalls.push(options)
      this.config = { appPath: tempRoot }
      this.sounding = {
        id: `lift-${liftCalls.length}`,
        boot: async () => ({ sails: this }),
        lower: async () => {},
      }
      this.hooks = { sounding: this.sounding }
      done(undefined, this)
    }

    lower(done) {
      lowerCalls.push(this.sounding.id)
      done()
    }
  }

  const manager = createAppManager({
    appPath: tempRoot,
    SailsConstructor: FakeSails,
  })

  const loadedRuntime = await manager.runtime({ app: 'load' })
  const warmLoadedRuntime = await manager.runtime({ app: 'load' })

  assert.equal(warmLoadedRuntime, loadedRuntime)
  assert.equal(loadedRuntime.id, 'load-1')
  assert.equal(loadCalls.length, 1)
  assert.equal(manager.lifecycle.load.status, 'ready')
  assert.equal(manager.lifecycle.load.runs, 1)
  assert.equal(manager.lifecycle.load.reuses, 1)
  assert.equal(typeof manager.lifecycle.load.durationMs, 'number')
  assert.ok(manager.lifecycle.load.readyAt)
  assert.equal(globalThis.sails.sounding.id, 'load-1')

  const reloadedRuntime = await manager.runtime({ app: 'load', reload: true })

  assert.equal(reloadedRuntime.id, 'load-2')
  assert.notEqual(reloadedRuntime, loadedRuntime)
  assert.equal(loadCalls.length, 2)
  assert.deepEqual(lowerCalls, ['load-1'])
  assert.equal(manager.lifecycle.load.reloads, 1)
  assert.equal(globalThis.sails.sounding.id, 'load-2')

  const liftedRuntime = await manager.runtime({ app: 'lift' })
  const transportLiftedRuntime = await manager.runtime({ transport: 'http' })

  assert.equal(liftedRuntime.id, 'lift-1')
  assert.equal(transportLiftedRuntime, liftedRuntime)
  assert.equal(liftCalls.length, 1)
  assert.equal(manager.lifecycle.lift.status, 'ready')
  assert.equal(manager.lifecycle.lift.runs, 1)
  assert.equal(manager.lifecycle.lift.reuses, 1)
  assert.equal(globalThis.sails.sounding.id, 'lift-1')

  await manager.lower()

  assert.deepEqual(lowerCalls.sort(), ['lift-1', 'load-1', 'load-2'].sort())
  assert.equal(manager.lifecycle.load.status, 'idle')
  assert.equal(manager.lifecycle.lift.status, 'idle')
  assert.equal(globalThis.sails, undefined)
  assert.equal(globalThis.sounding, undefined)
})

test('createAppManager reports unknown app lifecycle options and modes with stable codes', async () => {
  const manager = createAppManager({
    SailsConstructor: class FakeSails {},
  })

  await assert.rejects(
    async () => {
      await manager.runtime({ http: true })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_APP_MANAGER_OPTION_UNKNOWN')
      assert.equal(error.option, 'http')
      assert.deepEqual(error.allowed, ['app', 'transport', 'reload'])
      return true
    }
  )

  await assert.rejects(
    async () => {
      await manager.runtime({ app: 'reload' })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_APP_MODE_UNKNOWN')
      assert.deepEqual(error.allowed, ['load', 'lift'])
      return true
    }
  )
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
