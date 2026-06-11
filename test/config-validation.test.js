const test = require('node:test')
const assert = require('node:assert/strict')

const { createRuntime, resolveConfig } = require('../lib/create-runtime')

test('resolveConfig reports invalid datastore modes with allowed values', () => {
  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            datastore: {
              mode: 'temporary',
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.name, 'SoundingConfigError')
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.datastore.mode')
      assert.equal(error.value, 'temporary')
      assert.deepEqual(error.allowed, ['managed', 'inherit', 'external'])
      assert.match(error.message, /sounding\.datastore\.mode/)
      return true
    }
  )
})

test('createRuntime rejects invalid request transports before the first request', async () => {
  const runtime = createRuntime({
    config: {
      sounding: {
        request: {
          transport: 'socket',
        },
      },
    },
    models: {},
    helpers: {},
  })

  await assert.rejects(
    async () => {
      await runtime.boot()
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.request.transport')
      assert.equal(error.value, 'socket')
      assert.deepEqual(error.allowed, ['virtual', 'http'])
      assert.match(error.suggestion, /Use `virtual`/)
      return true
    }
  )
})

test('resolveConfig names invalid browser fields precisely', () => {
  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            browser: {
              projects: ['desktop', 42],
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.browser.projects[1]')
      assert.equal(error.value, 42)
      assert.match(error.message, /must be a string/)
      return true
    }
  )
})

test('resolveConfig validates websocket helper options precisely', () => {
  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            sockets: {
              timeout: 'soon',
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.sockets.timeout')
      assert.equal(error.value, 'soon')
      assert.match(error.message, /positive number/)
      return true
    }
  )
})

test('resolveConfig suggests nearby option names for misspelled config keys', () => {
  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            requst: {
              transport: 'http',
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.requst')
      assert.equal(error.suggestion, 'Did you mean `sounding.request`?')
      return true
    }
  )
})

test('resolveConfig rejects legacy managed datastore config with a migration hint', () => {
  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            datastore: {
              managed: {
                directory: '.tmp/custom-db',
                isolation: 'run',
              },
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.datastore.managed')
      assert.deepEqual(error.value, {
        directory: '.tmp/custom-db',
        isolation: 'run',
      })
      assert.equal(
        error.suggestion,
        'Use `datastore: { mode: \'managed\', root: ".tmp/custom-db", isolation: "run" }` instead.'
      )
      return true
    }
  )
})

test('resolveConfig rejects legacy datastore directory config with a migration hint', () => {
  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            datastore: {
              directory: '.tmp/custom-db',
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.datastore.directory')
      assert.equal(error.value, '.tmp/custom-db')
      assert.equal(error.suggestion, 'Use `sounding.datastore.root` instead.')
      return true
    }
  )
})
