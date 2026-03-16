const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const { createRequestClient } = require('../lib/create-request-client')
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
  createExpect(response).toHaveStatus(200)
  createExpect(response).toHaveJsonPath('ok', true)
  assert.deepEqual(await response.json(), { ok: true })
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
