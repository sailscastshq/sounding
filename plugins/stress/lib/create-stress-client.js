const { createStressResult } = require('./result')

const DEFAULT_DURATION = 10
const DEFAULT_CONCURRENCY = 1
const BODY_METHODS = ['POST', 'PUT', 'PATCH', 'OPTIONS']

/**
 * @param {string} value
 * @returns {boolean}
 */
function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value)
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {any} value
 * @returns {Record<string, any>}
 */
function toHeaderObject(value) {
  if (!value) {
    return {}
  }

  if (typeof Headers !== 'undefined' && value instanceof Headers) {
    return Object.fromEntries(value.entries())
  }

  if (Array.isArray(value)) {
    return Object.fromEntries(value)
  }

  return { ...value }
}

/**
 * @param {any} value
 * @param {string} name
 * @param {any} api
 * @returns {number}
 */
function assertPositiveInteger(value, name, api) {
  const number = Number(value)

  if (!Number.isInteger(number) || number < 1) {
    throw api.createSoundingError({
      code: 'E_SOUNDING_STRESS_OPTION_INVALID',
      name: 'SoundingStressError',
      message: `Sounding stress option \`${name}\` must be a positive integer.`,
      details: {
        option: name,
        value,
      },
    })
  }

  return number
}

/**
 * @param {any} api
 * @returns {(options: Record<string, any>) => Promise<any>}
 */
function createDefaultEngineRunner(api) {
  return async function runAutocannon(options) {
    let autocannon

    try {
      autocannon = require('autocannon')
    } catch (error) {
      throw api.createSoundingError({
        code: 'E_SOUNDING_STRESS_ENGINE_MISSING',
        name: 'SoundingStressError',
        message:
          'Sounding stress testing needs `autocannon`. Install `sounding-plugin-stress`, which provides the stress engine.',
        details: {
          dependency: 'autocannon',
          plugin: 'sounding-plugin-stress',
          install: 'npm install -D sounding-plugin-stress',
        },
        cause: error,
      })
    }

    return autocannon(options)
  }
}

/**
 * @param {{
 *   payload: any,
 *   headers: Record<string, any>,
 *   method: string,
 * }} input
 */
function normalizeBody({ payload, headers, method }) {
  if (payload === undefined || !BODY_METHODS.includes(method)) {
    return {
      body: undefined,
      headers,
      bodyBytes: 0,
    }
  }

  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    return {
      body: payload,
      headers,
      bodyBytes: Buffer.byteLength(payload),
    }
  }

  if (isPlainObject(payload) || Array.isArray(payload)) {
    const nextHeaders = { ...headers }
    const hasContentType = Object.keys(nextHeaders).some(
      (header) => header.toLowerCase() === 'content-type'
    )

    if (!hasContentType) {
      nextHeaders['content-type'] = 'application/json'
    }

    const body = JSON.stringify(payload)
    return {
      body,
      headers: nextHeaders,
      bodyBytes: Buffer.byteLength(body),
    }
  }

  return {
    body: payload,
    headers,
    bodyBytes: 0,
  }
}

/**
 * @param {{
 *   api: any,
 *   actor: any,
 *   world?: any,
 *   sails?: any,
 *   getConfig?: () => any,
 * }} input
 */
function resolveActor({ api, actor, world, sails, getConfig }) {
  if (!actor) {
    return null
  }

  if (typeof actor === 'object') {
    return actor
  }

  const resolved = api.resolveWorldActor({
    actor,
    world,
    sails,
    getConfig,
  })

  if (!resolved) {
    throw api.createRequestActorUnresolvedError({
      actor,
      world,
      sails,
      getConfig,
    })
  }

  return resolved
}

/**
 * @param {{
 *   api: any,
 *   actor: any,
 *   headers: Record<string, any>,
 *   sails?: any,
 *   getConfig?: () => any,
 * }} input
 */
async function resolveActorRequestHeaders({ api, actor, headers, sails, getConfig }) {
  if (!actor) {
    return headers
  }

  const auth = api.resolveAuthConfig({ sails, getConfig })
  const actorHeaders = toHeaderObject(api.resolveActorHeaders(actor))
  const actorSession = api.resolveActorSession(actor, auth)
  const nextHeaders = {
    ...actorHeaders,
    ...headers,
  }
  const hasCookie = Object.keys(nextHeaders).some((header) => header.toLowerCase() === 'cookie')

  if (!hasCookie && Object.keys(actorSession || {}).length > 0) {
    const cookie = await api.createSessionCookie(sails, actorSession)

    if (cookie) {
      nextHeaders.cookie = cookie
    }
  }

  return nextHeaders
}

/**
 * @param {{
 *   api: any,
 *   state: Record<string, any>,
 *   sails?: any,
 *   getConfig?: () => any,
 *   world?: any,
 * }} input
 */
async function buildEngineOptions({ api, state, sails, getConfig, world }) {
  const target = state.target
  const url = isAbsoluteUrl(target)
    ? target
    : api.resolveUrl({
        sails,
        getConfig,
        target,
        baseUrl: state.baseUrl,
      })
  const actor = resolveActor({
    api,
    actor: state.actor,
    world,
    sails,
    getConfig,
  })
  const actorHeaders = await resolveActorRequestHeaders({
    api,
    actor,
    headers: state.headers,
    sails,
    getConfig,
  })
  const body = normalizeBody({
    payload: state.payload,
    headers: actorHeaders,
    method: state.method,
  })

  return {
    url,
    target,
    method: state.method,
    concurrency: state.concurrency,
    duration: state.duration,
    bodyBytes: body.bodyBytes,
    engine: {
      url,
      method: state.method,
      connections: state.concurrency,
      duration: state.duration,
      headers: body.headers,
      ...(body.body !== undefined ? { body: body.body } : {}),
    },
  }
}

/**
 * @param {{
 *   api: any,
 *   state: Record<string, any>,
 *   runEngine: (options: Record<string, any>) => Promise<any>,
 *   sails?: any,
 *   getConfig?: () => any,
 *   world?: any,
 *   events?: any,
 * }} input
 */
function createStressChain({ api, state, runEngine, sails, getConfig, world, events }) {
  const clone = (patch) =>
    createStressChain({
      api,
      state: {
        ...state,
        ...patch,
      },
      runEngine,
      sails,
      getConfig,
      world,
      events,
    })

  async function run() {
    const options = await buildEngineOptions({
      api,
      state,
      sails,
      getConfig,
      world,
    })

    events?.emit?.('stress:start', options)
    const raw = (await runEngine(options.engine)) || {}
    raw.bodyBytes = options.bodyBytes * (raw?.requests?.total || 0)
    const result = createStressResult({
      raw,
      options,
    })
    events?.emit?.('stress:done', result)
    return result
  }

  return {
    as(actor) {
      return clone({ actor })
    },
    baseUrl(baseUrl) {
      return clone({ baseUrl })
    },
    headers(headers = {}) {
      return clone({
        headers: {
          ...state.headers,
          ...toHeaderObject(headers),
        },
      })
    },
    header(name, value) {
      return this.headers({ [name]: value })
    },
    json(payload) {
      return clone({
        payload,
        headers: {
          ...state.headers,
          'content-type': 'application/json',
        },
      })
    },
    body(payload) {
      return clone({ payload })
    },
    concurrently(concurrency) {
      return clone({
        concurrency: assertPositiveInteger(concurrency, 'concurrency', api),
      })
    },
    for(duration) {
      const seconds = assertPositiveInteger(duration, 'duration', api)

      return {
        seconds: () => clone({ duration: seconds }).run(),
        second: () => clone({ duration: seconds }).run(),
      }
    },
    run,
    then(onFulfilled, onRejected) {
      return run().then(onFulfilled, onRejected)
    },
    catch(onRejected) {
      return run().catch(onRejected)
    },
    finally(onFinally) {
      return run().finally(onFinally)
    },
  }
}

/**
 * @param {{
 *   api: any,
 *   sails?: any,
 *   getConfig?: () => any,
 *   world?: any,
 *   appPath?: string,
 *   events?: any,
 *   runEngine?: (options: Record<string, any>) => Promise<any>,
 * }} input
 */
function createStressClient({
  api,
  sails,
  getConfig,
  world,
  events,
  runEngine = createDefaultEngineRunner(api),
}) {
  function request(method, target, payload) {
    return createStressChain({
      api,
      sails,
      getConfig,
      world,
      events,
      runEngine,
      state: {
        method,
        target,
        payload,
        headers: {},
        concurrency: DEFAULT_CONCURRENCY,
        duration: DEFAULT_DURATION,
      },
    })
  }

  return {
    request(method, target, payload) {
      return request(String(method || 'GET').toUpperCase(), target, payload)
    },
    get(target) {
      return request('GET', target)
    },
    head(target) {
      return request('HEAD', target)
    },
    options(target, payload) {
      return request('OPTIONS', target, payload)
    },
    post(target, payload) {
      return request('POST', target, payload)
    },
    put(target, payload) {
      return request('PUT', target, payload)
    },
    patch(target, payload) {
      return request('PATCH', target, payload)
    },
    delete(target, payload) {
      return request('DELETE', target, payload)
    },
  }
}

module.exports = {
  createStressClient,
  createDefaultEngineRunner,
}
