const { Transform } = require('node:stream')
const QS = require('node:querystring')
const { resolveAuthConfig } = require('./resolve-auth-config')

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value)
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/, '')
}

function looksLikeJson({ contentType, body }) {
  if (!body) {
    return false
  }

  if (contentType?.includes('application/json')) {
    return true
  }

  return /^[\[{]/.test(String(body).trim())
}

function normalizeBodyValue(value) {
  if (value === undefined || value === null) {
    return {
      body: '',
      data: undefined,
    }
  }

  if (typeof value === 'string') {
    return {
      body: value,
      data: undefined,
    }
  }

  return {
    body: JSON.stringify(value),
    data: value,
  }
}

function normalizeResponse({
  raw,
  status,
  statusText = '',
  headers = {},
  url,
  redirected = false,
  responseBody,
}) {
  const normalizedHeaders = new Headers(headers)
  const contentType = normalizedHeaders.get('content-type') || ''
  let { body, data } = normalizeBodyValue(responseBody)

  if (data === undefined && looksLikeJson({ contentType, body })) {
    data = JSON.parse(body)
  }

  return {
    raw,
    ok: status >= 200 && status < 400,
    status,
    statusText,
    url,
    redirected,
    headers: normalizedHeaders,
    body,
    data,
    header(name) {
      return normalizedHeaders.get(name)
    },
    async text() {
      return body
    },
    async json() {
      return data
    },
  }
}

function resolveRequestConfig({ sails, getConfig }) {
  const soundingConfig =
    (typeof getConfig === 'function' ? getConfig() : null) || sails?.config?.sounding || {}

  return soundingConfig.request || {}
}

function resolveBaseUrl({ sails, getConfig, override }) {
  if (override) {
    return trimTrailingSlash(override)
  }

  const requestConfig = resolveRequestConfig({ sails, getConfig })
  if (requestConfig.baseUrl) {
    return trimTrailingSlash(requestConfig.baseUrl)
  }

  const soundingConfig =
    (typeof getConfig === 'function' ? getConfig() : null) || sails?.config?.sounding || {}

  if (soundingConfig.browser?.baseUrl) {
    return trimTrailingSlash(soundingConfig.browser.baseUrl)
  }

  const address = sails?.hooks?.http?.server?.address?.()
  if (address && typeof address === 'object' && address.port) {
    const host =
      !address.address || address.address === '::' || address.address === '0.0.0.0'
        ? '127.0.0.1'
        : address.address

    return `http://${host}:${address.port}`
  }

  if (sails?.config?.port) {
    return `http://127.0.0.1:${sails.config.port}`
  }

  throw new Error(
    'Sounding could not resolve a base URL for HTTP request trials. Configure `sounding.request.baseUrl`, `sounding.browser.baseUrl`, or lift Sails with the HTTP hook.'
  )
}

function resolveUrl({ sails, getConfig, target, baseUrl }) {
  if (isAbsoluteUrl(target)) {
    return target
  }

  const resolvedBaseUrl = resolveBaseUrl({
    sails,
    getConfig,
    override: baseUrl,
  })

  if (target.startsWith('/')) {
    return `${resolvedBaseUrl}${target}`
  }

  return `${resolvedBaseUrl}/${target}`
}

function normalizePayload(method, payload) {
  if (payload === undefined) {
    return undefined
  }

  if (['GET', 'HEAD', 'DELETE'].includes(method)) {
    return payload
  }

  if (isPlainObject(payload) || Array.isArray(payload)) {
    return payload
  }

  return payload
}

function resolveTransport({ sails, getConfig, target, options = {} }) {
  if (options.transport) {
    return options.transport
  }

  if (isAbsoluteUrl(target) || options.baseUrl) {
    return 'http'
  }

  const requestConfig = resolveRequestConfig({ sails, getConfig })
  return requestConfig.transport || 'virtual'
}

function normalizeVirtualUrl(method, target, payload) {
  if (
    (method === 'GET' || method === 'HEAD' || method === 'DELETE') &&
    isPlainObject(payload)
  ) {
    const stringifiedParams = QS.stringify(payload)
    const queryStringPos = target.indexOf('?')

    if (queryStringPos === -1) {
      return `${target}?${stringifiedParams}`
    }

    return `${target.substring(0, queryStringPos)}?${stringifiedParams}`
  }

  return target
}

function createFlash(session = {}) {
  const flashStore = (session.__soundingFlashStore ||= {})

  return function flash(key, value) {
    if (arguments.length === 1) {
      const messages = flashStore[key] || []
      delete flashStore[key]
      return messages
    }

    flashStore[key] ||= []
    flashStore[key].push(value)
    return flashStore[key]
  }
}

class MockClientResponse extends Transform {
  _transform(chunk, _encoding, next) {
    this.push(chunk)
    next()
  }
}

function createVirtualTransport({ sails }) {
  if (typeof sails?.router?.route !== 'function') {
    throw new Error(
      'Sounding could not find `sails.router.route()`. Virtual request transport requires a loaded Sails app.'
    )
  }

  return {
    async send(method, target, payload, options = {}) {
      return new Promise((resolve, reject) => {
        const session = options.session || defaultSessionState()
        const clientRes = new MockClientResponse()

        try {
          clientRes.on('finish', () => {
            try {
              clientRes.body = clientRes.read()
              clientRes.body = clientRes.body?.toString()
            } catch {}

            if (!clientRes.body) {
              delete clientRes.body
            }

            if (
              clientRes.body !== undefined &&
              clientRes.headers?.['content-type'] === 'application/json'
            ) {
              clientRes.body = JSON.parse(clientRes.body)
            }

            const status = clientRes.statusCode || 500
            const responseBody = clientRes.body

            resolve(
              normalizeResponse({
                raw: clientRes,
                status,
                statusText: clientRes.statusMessage || '',
                headers: clientRes.headers || {},
                url: target,
                redirected: status >= 300 && status < 400,
                responseBody,
              })
            )
          })

          clientRes.on('error', (error) => {
            reject(error || new Error('Error on virtual response stream'))
          })

          sails.router.route(
            {
              method,
              url: normalizeVirtualUrl(method, target, normalizePayload(method, payload)),
              body: ['GET', 'HEAD', 'DELETE'].includes(method)
                ? undefined
                : normalizePayload(method, payload),
              headers: {
                ...(options.headers || {}),
                nosession: 'true',
              },
              session,
              flash: createFlash(session),
            },
            {
              _clientRes: clientRes,
            }
          )
        } catch (error) {
          reject(error)
          return
        }
      })
    },
  }
}

function defaultSessionState() {
  return {}
}

function normalizeBodyAndHeaders(method, payload, headers) {
  if (payload === undefined || method === 'GET' || method === 'HEAD') {
    return {
      body: undefined,
      headers,
    }
  }

  if (
    typeof payload === 'string' ||
    payload instanceof URLSearchParams ||
    (typeof FormData !== 'undefined' && payload instanceof FormData) ||
    payload instanceof ArrayBuffer ||
    ArrayBuffer.isView(payload)
  ) {
    return {
      body: payload,
      headers,
    }
  }

  if (isPlainObject(payload) || Array.isArray(payload)) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    return {
      body: JSON.stringify(payload),
      headers,
    }
  }

  return {
    body: payload,
    headers,
  }
}

function createHttpTransport({
  sails,
  getConfig,
  fetchImplementation = globalThis.fetch,
}) {
  if (typeof fetchImplementation !== 'function') {
    throw new Error('Sounding could not find a fetch implementation for HTTP request trials.')
  }

  return {
    async send(method, target, payload, options = {}) {
      const headers = new Headers({
        accept: 'application/json',
        ...(options.headers || {}),
      })

      const { body, headers: finalHeaders } = normalizeBodyAndHeaders(method, payload, headers)

      const response = await fetchImplementation(
        resolveUrl({
          sails,
          getConfig,
          target,
          baseUrl: options.baseUrl,
        }),
        {
          method,
          redirect: options.redirect || 'manual',
          ...options,
          headers: finalHeaders,
          body,
        }
      )

      return normalizeResponse({
        raw: response,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        url: response.url,
        redirected: response.redirected,
        responseBody: await response.text(),
      })
    },
  }
}

function createRequestClient({
  sails,
  getConfig,
  fetchImplementation = globalThis.fetch,
  defaultHeaders = {},
  defaultSession = {},
  transportOverride,
} = {}) {
  let virtualTransport = null
  let httpTransport = null

  function getVirtualTransport() {
    virtualTransport ||= createVirtualTransport({ sails })
    return virtualTransport
  }

  function getHttpTransport() {
    httpTransport ||= createHttpTransport({
      sails,
      getConfig,
      fetchImplementation,
    })
    return httpTransport
  }

  async function send(method, target, payloadOrOptions, maybeOptions) {
    const hasPayload = !['GET', 'HEAD'].includes(method)
    const payload = hasPayload ? payloadOrOptions : undefined
    const options = (hasPayload ? maybeOptions : payloadOrOptions) || {}
    const headers = {
      ...defaultHeaders,
      ...(options.headers || {}),
    }
    const session = options.session
      ? {
          ...defaultSession,
          ...options.session,
        }
      : defaultSession
    const transport = resolveTransport({
      sails,
      getConfig,
      target,
      options: {
        ...options,
        transport: options.transport || transportOverride,
      },
    })

    const transportOptions = {
      ...options,
      headers,
      session,
    }

    if (transport === 'virtual') {
      return getVirtualTransport().send(method, target, payload, transportOptions)
    }

    if (transport === 'http') {
      return getHttpTransport().send(method, target, payload, transportOptions)
    }

    throw new Error(`Unknown Sounding request transport: ${transport}`)
  }

  return {
    get transport() {
      return transportOverride || resolveRequestConfig({ sails, getConfig }).transport || 'virtual'
    },

    async request(method, target, options = {}) {
      return send(method.toUpperCase(), target, undefined, options)
    },

    get(target, options = {}) {
      return send('GET', target, options)
    },

    head(target, options = {}) {
      return send('HEAD', target, options)
    },

    post(target, payload, options = {}) {
      return send('POST', target, payload, options)
    },

    put(target, payload, options = {}) {
      return send('PUT', target, payload, options)
    },

    patch(target, payload, options = {}) {
      return send('PATCH', target, payload, options)
    },

    delete(target, payload, options = {}) {
      return send('DELETE', target, payload, options)
    },

    withHeaders(headers = {}) {
      return createRequestClient({
        sails,
        getConfig,
        fetchImplementation,
        defaultHeaders: {
          ...defaultHeaders,
          ...headers,
        },
        defaultSession,
        transportOverride,
      })
    },

    withSession(session = {}) {
      return createRequestClient({
        sails,
        getConfig,
        fetchImplementation,
        defaultHeaders,
        defaultSession: {
          ...defaultSession,
          ...session,
        },
        transportOverride,
      })
    },

    using(transport) {
      return createRequestClient({
        sails,
        getConfig,
        fetchImplementation,
        defaultHeaders,
        defaultSession,
        transportOverride: transport,
      })
    },

    as(actor) {
      if (!actor) {
        return this
      }

      const auth = resolveAuthConfig({ sails, getConfig })
      const actorHeaders = actor.headers || actor.sounding?.headers || {}
      const actorSession = actor.session ||
        actor.sounding?.session || {
          ...(actor.id ? { [auth.sessionKey]: actor.id } : {}),
          ...(actor.team ? { teamId: actor.team } : {}),
          ...(actor.teamId ? { teamId: actor.teamId } : {}),
        }

      return this.withHeaders(actorHeaders).withSession(actorSession)
    },
  }
}

module.exports = {
  createRequestClient,
  createVirtualTransport,
  createHttpTransport,
  normalizeResponse,
  resolveBaseUrl,
  resolveTransport,
  resolveUrl,
}
