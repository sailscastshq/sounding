const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const { createRequestClient, normalizeResponse } = require('../lib/create-request-client')
const { createAuthHelpers } = require('../lib/create-auth-helpers')
const { createExpect } = require('../lib/create-expect')

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()))
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function assertJsonParseError(error, expected) {
  assert.equal(error.name, 'SoundingJsonParseError')
  assert.equal(error.code, 'E_SOUNDING_JSON_PARSE')
  assert.match(error.message, /Sounding could not parse JSON response/)
  assert.equal(error.status, expected.status)
  assert.equal(error.url, expected.url)
  assert.equal(error.contentType, expected.contentType)
  assert.equal(error.body, expected.body)
  assert.ok(error.cause instanceof SyntaxError)
  return true
}

test('createRequestClient defaults to the Sails-native virtual transport', async () => {
  const calls = []
  const sails = {
    router: {
      route(req, res) {
        calls.push(req)
        res._clientRes.statusCode = 200
        res._clientRes.headers = {
          'content-type': 'application/json',
        }
        res._clientRes.end(JSON.stringify({ ok: true }))
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  const response = await request.get('/health')

  assert.equal(request.transport, 'virtual')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].url, '/health')
  assert.deepEqual(calls[0].headers, { nosession: 'true' })
  assert.equal(calls[0].data, undefined)
  assert.deepEqual(calls[0].session.__soundingFlashStore, {})
  assert.equal(typeof calls[0].flash, 'function')
  assert.deepEqual(response.request, {
    method: 'GET',
    target: '/health',
    transport: 'virtual',
    url: '/health',
  })
  createExpect(response).toHaveStatus(200)
  createExpect(response).toHaveJsonPath('ok', true)
  assert.deepEqual(await response.json(), { ok: true })
})

test('request assertion failures include concise response diagnostics', () => {
  const response = normalizeResponse({
    raw: {},
    status: 500,
    statusText: 'Server Error',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req_123',
    },
    url: '/health',
    responseBody: JSON.stringify({
      message: 'Database unavailable',
      detail: 'Connection pool exhausted',
    }),
    request: {
      method: 'GET',
      target: '/health',
      transport: 'virtual',
      url: '/health',
    },
  })

  assert.throws(
    () => {
      createExpect(response).toHaveStatus(200)
    },
    (error) => {
      assert.match(error.message, /Expected response status 200, received 500/)
      assert.match(error.message, /Request: GET \/health \(virtual\)/)
      assert.match(error.message, /Response: 500 Server Error/)
      assert.match(error.message, /Headers: content-type: application\/json, x-request-id: req_123/)
      assert.match(error.message, /Body: \{"message":"Database unavailable"/)
      return true
    }
  )
})

test('request diagnostics expand response excerpts when verbose output is enabled', () => {
  const originalDiagnostics = process.env.SOUNDING_DIAGNOSTICS
  const longBody = `${'x'.repeat(520)}TAIL`
  const response = normalizeResponse({
    raw: {},
    status: 500,
    headers: {
      'content-type': 'text/plain',
    },
    url: '/verbose',
    responseBody: longBody,
    request: {
      method: 'GET',
      target: '/verbose',
      transport: 'virtual',
      url: '/verbose',
    },
  })

  try {
    delete process.env.SOUNDING_DIAGNOSTICS
    assert.throws(
      () => {
        createExpect(response).toHaveStatus(200)
      },
      (error) => {
        assert.match(error.message, /Body: x{500}\.\.\./)
        assert.doesNotMatch(error.message, /TAIL/)
        return true
      }
    )

    process.env.SOUNDING_DIAGNOSTICS = 'verbose'
    assert.throws(
      () => {
        createExpect(response).toHaveStatus(200)
      },
      (error) => {
        assert.match(error.message, /TAIL/)
        assert.doesNotMatch(error.message, /Body: x{500}\.\.\./)
        return true
      }
    )
  } finally {
    if (originalDiagnostics === undefined) {
      delete process.env.SOUNDING_DIAGNOSTICS
    } else {
      process.env.SOUNDING_DIAGNOSTICS = originalDiagnostics
    }
  }
})

test('createRequestClient can attach an actor session for virtual policy checks', async () => {
  const calls = []
  const sails = {
    router: {
      route(req, res) {
        calls.push(req)
        res._clientRes.statusCode = 200
        res._clientRes.headers = {
          'content-type': 'application/json',
        }
        res._clientRes.end(JSON.stringify({ ok: true }))
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  await request.as({ id: 24, team: 8 }).get('/dashboard')

  assert.equal(calls[0].session.userId, 24)
  assert.equal(calls[0].session.teamId, 8)
  assert.deepEqual(calls[0].session.__soundingFlashStore, {})
})

test('createRequestClient.as resolves User world actor aliases', async () => {
  const calls = []
  const sails = {
    router: {
      route(req, res) {
        calls.push(req)
        res._clientRes.statusCode = 200
        res._clientRes.headers = {
          'content-type': 'application/json',
        }
        res._clientRes.end(JSON.stringify({ userId: req.session.userId }))
      },
    },
    config: {
      sounding: {},
    },
  }
  const world = {
    current: {
      users: {
        owner: {
          id: 24,
          email: 'owner@example.com',
        },
      },
    },
  }

  const request = createRequestClient({ sails, world })
  const response = await request.as('owner').get('/dashboard')

  assert.equal(calls[0].session.userId, 24)
  createExpect(response).toHaveJsonPath('userId', 24)
})

test('createRequestClient.as resolves Creator world actor aliases', async () => {
  const calls = []
  const sails = {
    models: {
      creator: {},
    },
    router: {
      route(req, res) {
        calls.push(req)
        res._clientRes.statusCode = 200
        res._clientRes.headers = {
          'content-type': 'application/json',
        }
        res._clientRes.end(JSON.stringify({ creatorId: req.session.creatorId }))
      },
    },
    config: {
      sounding: {},
    },
  }
  const world = {
    current: {
      creators: {
        owner: {
          id: 9,
          email: 'creator@example.com',
        },
      },
    },
  }

  const request = createRequestClient({ sails, world })
  const response = await request.as('owner').get('/invoices')

  assert.equal(calls[0].session.creatorId, 9)
  assert.equal(calls[0].session.userId, undefined)
  createExpect(response).toHaveJsonPath('creatorId', 9)
})

test('createRequestClient.as resolves email strings through the auth model', async () => {
  const calls = []
  const sails = {
    models: {
      user: {
        async findOne(criteria) {
          if (criteria.email === 'reader@example.com') {
            return {
              id: 7,
              email: 'reader@example.com',
            }
          }

          return null
        },
      },
    },
    router: {
      route(req, res) {
        calls.push(req)
        res._clientRes.statusCode = 200
        res._clientRes.headers = {
          'content-type': 'application/json',
        }
        res._clientRes.end(JSON.stringify({ userId: req.session.userId }))
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  const response = await request.as('reader@example.com').get('/me')

  assert.equal(calls[0].session.userId, 7)
  createExpect(response).toHaveJsonPath('userId', 7)
})

test('createRequestClient.as reports unresolved aliases with available world actors', async () => {
  const sails = {
    router: {
      route(_req, res) {
        res._clientRes.statusCode = 200
        res._clientRes.end('')
      },
    },
    config: {
      sounding: {},
    },
  }
  const world = {
    current: {
      users: {
        reader: {
          id: 7,
          email: 'reader@example.com',
        },
      },
      creators: {
        owner: {
          id: 9,
          email: 'owner@example.com',
        },
      },
    },
  }

  const request = createRequestClient({ sails, world })

  await assert.rejects(
    async () => {
      await request.as('editor').get('/dashboard')
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_REQUEST_ACTOR_UNRESOLVED')
      assert.equal(error.actor, 'editor')
      assert.deepEqual(error.availableActors, ['owner', 'reader'])
      assert.match(error.message, /Available actors: owner, reader/)
      return true
    }
  )
})

test('createRequestClient exposes final virtual session snapshots on responses', async () => {
  const sails = {
    router: {
      route(req, res) {
        if (req.method === 'POST' && req.url === '/login') {
          req.session.userId = 7
          req.session.returnTo = '/dashboard'
          req.flash('success', 'Welcome back')
          res._clientRes.statusCode = 302
          res._clientRes.headers = {
            location: '/dashboard',
          }
          res._clientRes.end('')
          return
        }

        if (req.method === 'POST' && req.url === '/logout') {
          delete req.session.userId
          req.session.loggedOut = true
          res._clientRes.statusCode = 204
          res._clientRes.end('')
          return
        }

        res._clientRes.statusCode = 404
        res._clientRes.end('')
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  const login = await request.post('/login', {
    email: 'reader@example.com',
  })

  assert.equal(login.session.userId, 7)
  assert.equal(login.session.returnTo, '/dashboard')
  assert.deepEqual(login.session.__soundingFlashStore.success, ['Welcome back'])
  createExpect(login).toHaveSession('userId', 7)
  createExpect(login).toHaveSession('returnTo', '/dashboard')
  createExpect(login).toHaveFlash('success', /welcome/i)
  createExpect(login).not.toHaveSession('loggedOut')
  createExpect(login).not.toHaveFlash('error')

  const originalLoginSnapshot = login.session
  const logout = await request.post('/logout')

  assert.equal(logout.session.userId, undefined)
  assert.equal(logout.session.returnTo, '/dashboard')
  assert.equal(logout.session.loggedOut, true)
  assert.notEqual(logout.session, originalLoginSnapshot)
  assert.equal(login.session.userId, 7)
  assert.equal(login.session.loggedOut, undefined)
  createExpect(logout).not.toHaveSession('userId')
  createExpect(logout).toHaveSession('loggedOut', true)
  createExpect(logout).not.toHaveFlash('success', /signed in/i)
})

test('createRequestClient.as uses creatorId when Creator auth is detected', async () => {
  const calls = []
  const sails = {
    models: {
      creator: {},
    },
    router: {
      route(req, res) {
        calls.push(req)
        res._clientRes.statusCode = 200
        res._clientRes.headers = {
          'content-type': 'application/json',
        }
        res._clientRes.end(JSON.stringify({ ok: true }))
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  await request.as({ id: 24 }).get('/dashboard')

  assert.equal(calls[0].session.creatorId, 24)
  assert.equal(calls[0].session.userId, undefined)
})

test('auth.request.withPassword preserves creator sessions through the shared request client', async () => {
  const calls = []
  const sails = {
    models: {
      creator: {
        async findOne(criteria) {
          if (criteria.id === 9 || criteria.email === 'creator@example.com') {
            return {
              id: 9,
              email: 'creator@example.com',
              firstName: 'Creator',
            }
          }

          return null
        },
      },
    },
    router: {
      route(req, res) {
        calls.push(req)

        if (req.method === 'POST' && req.url === '/login') {
          req.session.creatorId = 9
          res._clientRes.statusCode = 302
          res._clientRes.headers = {
            location: '/invoices',
          }
          res._clientRes.end('')
          return
        }

        if (req.method === 'GET' && req.url === '/invoices') {
          res._clientRes.statusCode = 200
          res._clientRes.headers = {
            'content-type': 'application/json',
          }
          res._clientRes.end(
            JSON.stringify({
              creatorId: req.session.creatorId || null,
            })
          )
          return
        }

        res._clientRes.statusCode = 404
        res._clientRes.end('')
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  const auth = createAuthHelpers({
    sails,
    world: {
      current: {
        creators: {
          owner: {
            id: 9,
            email: 'creator@example.com',
          },
        },
      },
    },
    mailbox: {
      latest() {
        return null
      },
    },
    request,
  })

  const login = await auth.request.withPassword('owner', {
    password: 'secret123',
    rememberMe: true,
    returnUrl: '/invoices',
  })
  const response = await request.get('/invoices')

  createExpect(login.response).toHaveStatus(302)
  createExpect(login.response).toRedirectTo('/invoices')
  createExpect(login.response).toHaveSession('creatorId', 9)
  createExpect(response).toHaveStatus(200)
  createExpect(response).toHaveJsonPath('creatorId', 9)
  assert.deepEqual(calls[0].body, {
    email: 'creator@example.com',
    password: 'secret123',
    rememberMe: true,
    returnUrl: '/invoices',
  })
  assert.equal(calls[0].session.creatorId, 9)
  assert.equal(calls[1].session.creatorId, 9)
})

test('createRequestClient.clearSession clears virtual session state from the shared request client', async () => {
  const sails = {
    router: {
      route(req, res) {
        if (req.method === 'POST' && req.url === '/login') {
          req.session.userId = 7
          res._clientRes.statusCode = 302
          res._clientRes.headers = {
            location: '/dashboard',
          }
          res._clientRes.end('')
          return
        }

        if (req.method === 'GET' && req.url === '/dashboard') {
          res._clientRes.statusCode = 200
          res._clientRes.headers = {
            'content-type': 'application/json',
          }
          res._clientRes.end(
            JSON.stringify({
              userId: req.session.userId || null,
            })
          )
          return
        }

        res._clientRes.statusCode = 404
        res._clientRes.end('')
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  await request.post('/login', {
    email: 'reader@example.com',
    password: 'secret123',
  })

  let response = await request.get('/dashboard')
  createExpect(response).toHaveJsonPath('userId', 7)

  request.clearSession()

  response = await request.get('/dashboard')
  createExpect(response).toHaveJsonPath('userId', null)

  response = await request.withSession({ userId: 11 }).get('/dashboard')
  createExpect(response).toHaveJsonPath('userId', 11)

  response = await request.get('/dashboard')
  createExpect(response).toHaveJsonPath('userId', null)
})

test('createRequestClient normalizes non-2xx virtual responses without rejecting', async () => {
  const sails = {
    router: {
      route(_req, res) {
        res._clientRes.statusCode = 401
        res._clientRes.headers = {
          'content-type': 'application/json',
        }
        res._clientRes.end(JSON.stringify({ message: 'Unauthorized' }))
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  const response = await request.get('/private')

  createExpect(response).toHaveStatus(401)
  createExpect(response).toHaveJsonPath('message', 'Unauthorized')
})

test('normalizeResponse handles JSON, text, and empty response bodies predictably', async () => {
  const json = normalizeResponse({
    raw: {},
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    responseBody: JSON.stringify({ ok: true }),
  })

  assert.equal(json.body, '{"ok":true}')
  assert.deepEqual(json.data, { ok: true })
  assert.deepEqual(await json.json(), { ok: true })

  const compatibleJson = normalizeResponse({
    raw: {},
    status: 200,
    headers: {
      'content-type': 'application/problem+json',
    },
    responseBody: '123',
  })

  assert.equal(compatibleJson.body, '123')
  assert.equal(compatibleJson.data, 123)

  const text = normalizeResponse({
    raw: {},
    status: 200,
    headers: {
      'content-type': 'text/plain',
    },
    responseBody: 'Hello from Sails',
  })

  assert.equal(await text.text(), 'Hello from Sails')
  assert.equal(await text.json(), undefined)
  assert.equal(text.data, undefined)

  const empty = normalizeResponse({
    raw: {},
    status: 204,
    headers: {
      'content-type': 'application/json',
    },
    responseBody: '',
  })

  assert.equal(empty.body, '')
  assert.equal(empty.data, undefined)
  assert.equal(await empty.json(), undefined)
})

test('normalizeResponse reports invalid JSON with response context', () => {
  assert.throws(
    () => {
      normalizeResponse({
        raw: {},
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        url: '/broken-json',
        responseBody: '{"ok":',
      })
    },
    (error) =>
      assertJsonParseError(error, {
        status: 200,
        url: '/broken-json',
        contentType: 'application/json; charset=utf-8',
        body: '{"ok":',
      })
  )
})

test('createRequestClient parses virtual JSON responses with charset content type', async () => {
  const sails = {
    router: {
      route(_req, res) {
        res._clientRes.statusCode = 200
        res._clientRes.headers = {
          'content-type': 'application/json; charset=utf-8',
        }
        res._clientRes.end(JSON.stringify({ ok: true }))
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  const response = await request.get('/health')

  assert.equal(response.body, '{"ok":true}')
  assert.deepEqual(await response.json(), { ok: true })
  createExpect(response).toHaveJsonPath('ok', true)
})

test('createRequestClient rejects invalid virtual JSON with response context', async () => {
  const sails = {
    router: {
      route(_req, res) {
        res._clientRes.statusCode = 200
        res._clientRes.headers = {
          'content-type': 'application/json',
        }
        res._clientRes.end('{"ok":')
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })

  await assert.rejects(
    async () => {
      await request.get('/broken-json')
    },
    (error) =>
      assertJsonParseError(error, {
        status: 200,
        url: '/broken-json',
        contentType: 'application/json',
        body: '{"ok":',
      })
  )
})

test('createRequestClient rejects invalid HTTP JSON with response context', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end('{"ok":')
  })

  const address = await listen(server)
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    const request = createRequestClient({
      sails: {
        config: {
          sounding: {
            request: {
              transport: 'http',
              baseUrl,
            },
          },
        },
      },
    })

    await assert.rejects(
      async () => {
        await request.get('/broken-json')
      },
      (error) =>
        assertJsonParseError(error, {
          status: 200,
          url: `${baseUrl}/broken-json`,
          contentType: 'application/json; charset=utf-8',
          body: '{"ok":',
        })
    )
  } finally {
    await close(server)
  }
})

test('createRequestClient reports missing virtual transport with a stable code', async () => {
  const request = createRequestClient({
    sails: {
      config: {
        sounding: {},
      },
    },
  })

  await assert.rejects(
    async () => {
      await request.get('/health')
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_VIRTUAL_TRANSPORT_UNAVAILABLE')
      assert.match(error.message, /sails\.router\.route/)
      return true
    }
  )
})

test('createRequestClient reports unresolved HTTP base URL with a stable code', async () => {
  const request = createRequestClient({
    sails: {
      config: {
        sounding: {
          request: {
            transport: 'http',
          },
        },
      },
    },
  })

  await assert.rejects(
    async () => {
      await request.get('/health')
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_BASE_URL_UNRESOLVED')
      assert.match(error.message, /could not resolve a base URL/)
      return true
    }
  )
})

test('createRequestClient reports unknown transports with a stable code', async () => {
  const request = createRequestClient({
    sails: {
      config: {
        sounding: {},
      },
    },
  }).using('custom-transport')

  await assert.rejects(
    async () => {
      await request.get('/health')
    },
    (error) => {
      assert.equal(error.code, 'E_SOUNDING_UNKNOWN_TRANSPORT')
      assert.equal(error.transport, 'custom-transport')
      assert.deepEqual(error.details, {
        transport: 'custom-transport',
      })
      return true
    }
  )
})

test('createRequestClient can follow the Sails-native redirect matcher contract over virtual transport', async () => {
  const sails = {
    router: {
      route(_req, res) {
        res._clientRes.statusCode = 302
        res._clientRes.headers = {
          location: '/login',
        }
        res._clientRes.end('')
      },
    },
    config: {
      sounding: {},
    },
  }

  const request = createRequestClient({ sails })
  const response = await request.get('/dashboard')

  createExpect(response).toHaveStatus(302)
  createExpect(response).toRedirectTo('/login')
})

test('createRequestClient can use explicit HTTP transport when parity matters more', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(404)
    res.end()
  })

  const address = await listen(server)

  try {
    const request = createRequestClient({
      sails: {
        router: {
          route() {
            throw new Error('virtual transport should not be used in this test')
          },
        },
        request() {
          throw new Error('virtual transport should not be used in this test')
        },
        config: {
          sounding: {
            request: {
              transport: 'http',
              baseUrl: `http://127.0.0.1:${address.port}`,
            },
          },
        },
      },
    })

    const response = await request.get('/health')

    assert.equal(request.transport, 'http')
    createExpect(response).toHaveStatus(200)
    createExpect(response).toHaveJsonPath('ok', true)
    assert.equal(response.session, undefined)
    assert.throws(
      () => {
        createExpect(response).toHaveSession('userId')
      },
      (error) => {
        assert.equal(error.code, 'E_SOUNDING_RESPONSE_SESSION_UNAVAILABLE')
        assert.match(error.message, /virtual request response/)
        assert.match(error.message, /HTTP responses/)
        return true
      }
    )
    assert.deepEqual(await response.json(), { ok: true })
  } finally {
    await close(server)
  }
})

test('createRequestClient can scope a client to http transport without changing the original client', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, transport: 'http' }))
      return
    }

    res.writeHead(404)
    res.end()
  })

  const address = await listen(server)

  try {
    const sails = {
      router: {
        route(_req, res) {
          res._clientRes.statusCode = 200
          res._clientRes.headers = {
            'content-type': 'application/json',
          }
          res._clientRes.end(JSON.stringify({ ok: true, transport: 'virtual' }))
        },
      },
      config: {
        sounding: {
          request: {
            transport: 'virtual',
            baseUrl: `http://127.0.0.1:${address.port}`,
          },
        },
      },
    }

    const request = createRequestClient({ sails })
    const httpRequest = request.using('http')

    const httpResponse = await httpRequest.get('/health')
    const virtualResponse = await request.get('/health')

    assert.equal(request.transport, 'virtual')
    assert.equal(httpRequest.transport, 'http')
    createExpect(httpResponse).toHaveJsonPath('transport', 'http')
    createExpect(virtualResponse).toHaveJsonPath('transport', 'virtual')
  } finally {
    await close(server)
  }
})
