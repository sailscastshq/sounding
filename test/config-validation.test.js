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
      assert.match(error.message, /must be an object/)
      return true
    }
  )
})

test('resolveConfig validates named browser projects', () => {
  const config = resolveConfig({
    config: {
      sounding: {
        browser: {
          projects: {
            desktop: {},
            mobile: {
              device: 'iPhone 13',
            },
            safari: {
              type: 'webkit',
              viewport: {
                width: 1280,
                height: 720,
              },
              contextOptions: {
                colorScheme: 'dark',
              },
              launchOptions: {
                slowMo: 25,
              },
            },
          },
          defaultProject: 'safari',
        },
      },
    },
  })

  assert.equal(config.browser.defaultProject, 'safari')
  assert.equal(config.browser.projects.safari.type, 'webkit')
  assert.equal(config.browser.projects.mobile.device, 'iPhone 13')

  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            browser: {
              projects: {
                desktop: {},
              },
              defaultProject: 'mobile',
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.browser.defaultProject')
      assert.equal(error.value, 'mobile')
      assert.deepEqual(error.allowed, ['desktop'])
      return true
    }
  )

  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            browser: {
              projects: {
                safari: {
                  type: 'safari',
                },
              },
              defaultProject: 'safari',
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.browser.projects.safari.type')
      assert.equal(error.value, 'safari')
      assert.deepEqual(error.allowed, ['chromium', 'firefox', 'webkit'])
      return true
    }
  )
})

test('resolveConfig validates browser artifact options precisely', () => {
  const config = resolveConfig({
    config: {
      sounding: {
        browser: {
          artifacts: {
            outputDir: '.tmp/custom-artifacts',
            screenshot: true,
            trace: 'on-failure',
            video: 'off',
            currentUrl: false,
          },
        },
      },
    },
  })

  assert.equal(config.browser.artifacts.outputDir, '.tmp/custom-artifacts')
  assert.equal(config.browser.artifacts.screenshot, true)
  assert.equal(config.browser.artifacts.trace, 'on-failure')
  assert.equal(config.browser.artifacts.video, 'off')
  assert.equal(config.browser.artifacts.currentUrl, false)

  assert.throws(
    () => {
      resolveConfig({
        config: {
          sounding: {
            browser: {
              artifacts: {
                video: 'sometimes',
              },
            },
          },
        },
      })
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_CONFIG_INVALID')
      assert.equal(error.path, 'sounding.browser.artifacts.video')
      assert.equal(error.value, 'sometimes')
      assert.deepEqual(error.allowed, ['off', 'on', 'on-failure'])
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
