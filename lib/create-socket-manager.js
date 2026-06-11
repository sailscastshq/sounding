const { normalizeResponse, resolveBaseUrl } = require('./create-request-client')
const { createSoundingError } = require('./create-error')
const { loadDependencyFromApp } = require('./resolve-dependency')
const { resolveAuthConfig } = require('./resolve-auth-config')

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingActor} SoundingActor */
/** @typedef {import('./types').SoundingConfig} SoundingConfig */
/** @typedef {import('./types').SoundingResponse} SoundingResponse */
/** @typedef {import('./types').SoundingSocketClient} SoundingSocketClient */
/** @typedef {import('./types').SoundingSocketConnectOptions} SoundingSocketConnectOptions */
/** @typedef {import('./types').SoundingSocketEvent} SoundingSocketEvent */
/** @typedef {import('./types').SoundingSocketManager} SoundingSocketManager */
/** @typedef {import('./types').SoundingSocketRequestOptions} SoundingSocketRequestOptions */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */
/** @typedef {import('./types').SoundingWorldEngine} SoundingWorldEngine */

const SAILS_IO_SDK_QUERY = {
  __sails_io_sdk_version: '1.2.1',
  __sails_io_sdk_platform: 'node',
  __sails_io_sdk_language: 'javascript',
}

/**
 * @param {any} value
 * @returns {value is AnyRecord}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {any} value
 * @returns {AnyRecord}
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
 * @param {{ sails?: SoundingSailsApp, getConfig?: () => SoundingConfig }} input
 * @returns {SoundingConfig['sockets']}
 */
function resolveSocketConfig({ sails, getConfig }) {
  const soundingConfig =
    (typeof getConfig === 'function' ? getConfig() : null) || sails?.config?.sounding || {}

  return soundingConfig.sockets || {}
}

/**
 * @param {string} appPath
 * @param {{ resolveImplementation?: (moduleId: string, options?: { paths?: string[] }) => string }} [options]
 * @returns {any}
 */
function defaultLoadSocketIoClient(appPath, options = {}) {
  return loadDependencyFromApp({
    appPath,
    moduleId: 'socket.io-client',
    purpose: 'run websocket trials',
    install: 'npm install -D socket.io-client',
    resolveImplementation: options.resolveImplementation,
  })
}

/**
 * @param {SoundingSailsApp | undefined} sails
 * @returns {boolean}
 */
function hasSailsSocketSupport(sails) {
  return Boolean(sails?.hooks?.sockets && sails?.io && sails?.sockets)
}

/**
 * @param {{ appPath?: string }} input
 * @returns {Error}
 */
function createSocketHookUnavailableError({ appPath }) {
  return createSoundingError({
    code: 'E_SOUNDING_SOCKET_HOOK_UNAVAILABLE',
    name: 'SoundingSocketError',
    message:
      'Sounding websocket helpers need Sails socket support. Install and enable `sails-hook-sockets`, then lift the app with the sockets hook enabled.',
    details: {
      dependency: 'sails-hook-sockets',
      install: 'npm install sails-hook-sockets',
      appPath,
      suggestion:
        'If your test config disables `hooks.sockets`, set it to `true` for websocket trials.',
    },
  })
}

/**
 * @param {{ code: string, event?: string, timeout?: number, cause?: unknown, message: string }} input
 * @returns {Error}
 */
function createSocketError({ code, event, timeout, cause, message }) {
  return createSoundingError({
    code,
    name: 'SoundingSocketError',
    message,
    details: {
      event,
      timeout,
    },
    cause,
  })
}

/**
 * @param {any} value
 * @returns {any}
 */
function cloneJsonish(value) {
  if (Array.isArray(value)) {
    return value.map(cloneJsonish)
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneJsonish(nested)])
    )
  }

  return value
}

/**
 * @param {any[]} args
 * @returns {any}
 */
function normalizeEventPayload(args) {
  if (args.length === 0) {
    return undefined
  }

  if (args.length === 1) {
    return args[0]
  }

  return args
}

/**
 * @param {any} jwr
 * @param {string} method
 * @param {string} target
 * @param {any} body
 * @returns {SoundingResponse}
 */
function normalizeJwrResponse(jwr, method, target, body) {
  const status = jwr?.statusCode === undefined ? 200 : jwr.statusCode
  const headers = jwr?.headers || {}
  const responseBody = jwr?.body === undefined ? body : jwr.body

  return normalizeResponse({
    raw: jwr,
    status,
    statusText: '',
    headers,
    url: target,
    redirected: status >= 300 && status < 400,
    responseBody,
    request: {
      method: method.toUpperCase(),
      target,
      transport: 'socket',
      url: target,
    },
  })
}

/**
 * @param {SoundingSailsApp} sails
 * @param {AnyRecord} session
 * @returns {Promise<string | null>}
 */
async function createSessionCookie(sails, session) {
  if (
    !sails?.session ||
    typeof sails.session.generateNewSidCookie !== 'function' ||
    typeof sails.session.parseSessionIdFromCookie !== 'function' ||
    typeof sails.session.set !== 'function'
  ) {
    return null
  }

  const cookie = sails.session.generateNewSidCookie()
  const sid = sails.session.parseSessionIdFromCookie(cookie)

  await new Promise((resolve, reject) => {
    sails.session.set(
      sid,
      {
        cookie: {
          httpOnly: true,
          path: '/',
        },
        ...session,
      },
      (error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      }
    )
  })

  return cookie
}

/**
 * @param {any} socket
 * @param {number} timeout
 * @returns {Promise<void>}
 */
function waitForSocketConnect(socket, timeout) {
  if (socket.connected) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let timer = null

    function cleanup() {
      clearTimeout(timer)
      socket.off?.('connect', onConnect)
      socket.off?.('connect_error', onError)
      socket.off?.('error', onError)
      socket.off?.('connect_timeout', onTimeout)
    }

    function onConnect() {
      cleanup()
      resolve()
    }

    function onTimeout() {
      cleanup()
      reject(
        createSocketError({
          code: 'E_SOUNDING_SOCKET_CONNECT_TIMEOUT',
          timeout,
          message: `Sounding socket did not connect within ${timeout}ms.`,
        })
      )
    }

    function onError(error) {
      cleanup()
      reject(
        createSocketError({
          code: 'E_SOUNDING_SOCKET_CONNECT_FAILED',
          cause: error,
          message: 'Sounding socket failed to connect.',
        })
      )
    }

    timer = setTimeout(onTimeout, timeout)
    socket.on?.('connect', onConnect)
    socket.on?.('connect_error', onError)
    socket.on?.('error', onError)
    socket.on?.('connect_timeout', onTimeout)
  })
}

/**
 * @param {any} socket
 * @param {{
 *   timeout: number,
 *   defaultHeaders?: AnyRecord,
 * }} options
 * @returns {SoundingSocketClient}
 */
function wrapSocket(socket, { timeout, defaultHeaders = {} }) {
  /** @type {SoundingSocketEvent[]} */
  const history = []
  /** @type {SoundingSocketEvent[]} */
  const buffer = []
  /** @type {Array<{ event: string, resolve: (payload: any) => void, reject: (error: Error) => void, timer: NodeJS.Timeout }>} */
  const waiters = []
  let closed = false

  /**
   * @param {string} event
   * @param {any[]} args
   */
  function recordEvent(event, args) {
    const entry = {
      event,
      data: normalizeEventPayload(args),
      args: args.map(cloneJsonish),
      receivedAt: new Date().toISOString(),
    }

    history.push(entry)

    const waiterIndex = waiters.findIndex((waiter) => waiter.event === event)
    if (waiterIndex === -1) {
      buffer.push(entry)
      return
    }

    const [waiter] = waiters.splice(waiterIndex, 1)
    clearTimeout(waiter.timer)
    waiter.resolve(entry.data)
  }

  function attachEventBuffer() {
    if (typeof socket.onAny === 'function') {
      socket.onAny((event, ...args) => {
        recordEvent(event, args)
      })
      return
    }

    const originalOnevent = socket.onevent
    if (typeof originalOnevent === 'function') {
      socket.onevent = function soundingOnevent(packet) {
        const args = packet?.data || []
        if (typeof args[0] === 'string') {
          recordEvent(args[0], args.slice(1))
        }

        return originalOnevent.call(this, packet)
      }
    }
  }

  attachEventBuffer()

  /**
   * @param {string} method
   * @param {string} target
   * @param {any} [payload]
   * @param {SoundingSocketRequestOptions} [options]
   * @returns {Promise<SoundingResponse>}
   */
  function send(method, target, payload, options = {}) {
    return new Promise((resolve, reject) => {
      const requestTimeout = options.timeout || timeout
      const timer = setTimeout(() => {
        reject(
          createSocketError({
            code: 'E_SOUNDING_SOCKET_REQUEST_TIMEOUT',
            timeout: requestTimeout,
            message: `Sounding socket request to ${target} did not complete within ${requestTimeout}ms.`,
          })
        )
      }, requestTimeout)

      const requestOptions = {
        method,
        url: target,
        headers: {
          ...defaultHeaders,
          ...toHeaderObject(options.headers),
        },
      }

      if (payload !== undefined) {
        requestOptions.params = payload
      }

      try {
        socket.emit(method, requestOptions, (jwr) => {
          clearTimeout(timer)
          const body = jwr?.body
          resolve(normalizeJwrResponse(jwr, method, target, body))
        })
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    })
  }

  /** @type {SoundingSocketClient} */
  const client = {
    get id() {
      return socket.id
    },

    get connected() {
      return Boolean(socket.connected)
    },

    on(event, listener) {
      socket.on(event, listener)
      return client
    },

    off(event, listener) {
      socket.off(event, listener)
      return client
    },

    events(event) {
      return history
        .filter((entry) => (event ? entry.event === event : true))
        .map((entry) => entry.data)
    },

    async receive(event, options = {}) {
      const bufferedIndex = buffer.findIndex((entry) => entry.event === event)
      if (bufferedIndex !== -1) {
        const [entry] = buffer.splice(bufferedIndex, 1)
        return entry.data
      }

      const eventTimeout = options.timeout || timeout

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const waiterIndex = waiters.findIndex(
            (waiter) => waiter.event === event && waiter.resolve === resolve
          )

          if (waiterIndex !== -1) {
            waiters.splice(waiterIndex, 1)
          }

          reject(
            createSocketError({
              code: 'E_SOUNDING_SOCKET_EVENT_TIMEOUT',
              event,
              timeout: eventTimeout,
              message: `Sounding socket did not receive \`${event}\` within ${eventTimeout}ms.`,
            })
          )
        }, eventTimeout)

        waiters.push({
          event,
          resolve,
          reject,
          timer,
        })
      })
    },

    async request(method, target, payloadOrOptions, maybeOptions) {
      const normalizedMethod = method.toLowerCase()
      const hasPayload = !['get', 'head'].includes(normalizedMethod)
      const payload = hasPayload ? payloadOrOptions : undefined
      const options = (hasPayload ? maybeOptions : payloadOrOptions) || {}

      return send(normalizedMethod, target, payload, options)
    },

    async get(target, options) {
      return send('get', target, undefined, options)
    },

    async head(target, options) {
      return send('head', target, undefined, options)
    },

    async post(target, payload, options) {
      return send('post', target, payload, options)
    },

    async put(target, payload, options) {
      return send('put', target, payload, options)
    },

    async patch(target, payload, options) {
      return send('patch', target, payload, options)
    },

    async delete(target, payload, options) {
      return send('delete', target, payload, options)
    },

    async close() {
      if (closed) {
        return
      }

      closed = true
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer)
        waiter.reject(
          createSocketError({
            code: 'E_SOUNDING_SOCKET_CLOSED',
            event: waiter.event,
            message: 'Sounding socket closed before the event was received.',
          })
        )
      }

      socket.disconnect()
    },
  }

  return client
}

/**
 * @param {{
 *   sails?: SoundingSailsApp,
 *   getConfig?: () => SoundingConfig,
 *   actor?: SoundingActor | null,
 *   options?: SoundingSocketConnectOptions,
 * }} input
 * @returns {Promise<{ headers: AnyRecord, initialConnectionHeaders: AnyRecord }>}
 */
async function resolveActorSocketOptions({ sails, getConfig, actor, options = {} }) {
  const actorHeaders = toHeaderObject(actor?.sounding?.headers || actor?.headers)
  const optionHeaders = toHeaderObject(options.headers)
  const optionInitialHeaders = toHeaderObject(options.initialConnectionHeaders)
  const actorSession =
    actor?.sounding?.session ||
    actor?.session ||
    (actor?.id
      ? {
          [resolveAuthConfig({ sails, getConfig }).sessionKey]: actor.id,
          ...(actor.team ? { teamId: actor.team } : {}),
          ...(actor.teamId ? { teamId: actor.teamId } : {}),
        }
      : {})

  if (!optionInitialHeaders.cookie && Object.keys(actorSession).length > 0) {
    const cookie = await createSessionCookie(sails, actorSession)
    if (cookie) {
      optionInitialHeaders.cookie = cookie
    }
  }

  return {
    headers: {
      ...actorHeaders,
      ...optionHeaders,
    },
    initialConnectionHeaders: {
      ...optionInitialHeaders,
    },
  }
}

/**
 * @param {{
 *   actor?: SoundingActor | string | null,
 *   world?: SoundingWorldEngine,
 *   sails?: SoundingSailsApp,
 *   getConfig?: () => SoundingConfig,
 * }} input
 * @returns {SoundingActor | null}
 */
function resolveActor({ actor, world, sails, getConfig }) {
  if (!actor) {
    return null
  }

  if (typeof actor === 'object') {
    return actor
  }

  const auth = resolveAuthConfig({ sails, getConfig })
  return (
    world?.current?.[auth.worldCollection]?.[actor] ||
    world?.current?.[actor] ||
    null
  )
}

/**
 * @param {{
 *   sails?: SoundingSailsApp,
 *   getConfig?: () => SoundingConfig,
 *   world?: SoundingWorldEngine,
 *   appPathResolver?: () => string,
 *   loadSocketIoClient?: (appPath: string) => any,
 * }} input
 * @returns {SoundingSocketManager}
 */
function createSocketManager({
  sails,
  getConfig,
  world,
  appPathResolver = () => sails?.config?.appPath || process.cwd(),
  loadSocketIoClient = defaultLoadSocketIoClient,
} = {}) {
  /** @type {Set<SoundingSocketClient>} */
  const activeSockets = new Set()

  /**
   * @param {SoundingActor | string | null} actor
   * @param {SoundingSocketConnectOptions} [options]
   * @returns {Promise<SoundingSocketClient>}
   */
  async function connectAs(actor, options = {}) {
    const config = resolveSocketConfig({ sails, getConfig })

    if (config.enabled === false) {
      throw createSocketError({
        code: 'E_SOUNDING_SOCKET_DISABLED',
        message: 'Sounding socket helpers are disabled by `sounding.sockets.enabled`.',
      })
    }

    const timeout = options.timeout || config.timeout || 1000
    const appPath = appPathResolver()
    const socketClient = await loadSocketIoClient(appPath)

    if (!hasSailsSocketSupport(sails)) {
      throw createSocketHookUnavailableError({ appPath })
    }

    const baseUrl = resolveBaseUrl({
      sails,
      getConfig,
      override: options.baseUrl || config.baseUrl,
    })
    const resolvedActor = resolveActor({ actor, world, sails, getConfig })
    const actorOptions = await resolveActorSocketOptions({
      sails,
      getConfig,
      actor: resolvedActor,
      options,
    })
    const connectionOptions = {
      transports: options.transports || config.transports || ['websocket'],
      path: options.path || config.path || '/socket.io',
      timeout,
      reconnection: false,
      headers: {
        ...toHeaderObject(config.headers),
        ...actorOptions.headers,
      },
      initialConnectionHeaders: {
        ...toHeaderObject(config.initialConnectionHeaders),
        ...actorOptions.initialConnectionHeaders,
      },
    }

    const rawSocket = socketClient.io(baseUrl, {
      transports: connectionOptions.transports,
      path: connectionOptions.path,
      timeout,
      reconnection: false,
      query: SAILS_IO_SDK_QUERY,
      extraHeaders: connectionOptions.initialConnectionHeaders,
      transportOptions: Object.fromEntries(
        connectionOptions.transports.map((transport) => [
          transport,
          {
            extraHeaders: connectionOptions.initialConnectionHeaders,
          },
        ])
      ),
    })
    await waitForSocketConnect(rawSocket, timeout)

    const socket = wrapSocket(rawSocket, {
      timeout,
      defaultHeaders: connectionOptions.headers,
    })
    activeSockets.add(socket)
    return socket
  }

  return {
    connect(options) {
      return connectAs(null, options)
    },

    as(actor) {
      return {
        connect(options) {
          return connectAs(actor, options)
        },
      }
    },

    async closeAll() {
      const sockets = Array.from(activeSockets)
      activeSockets.clear()
      await Promise.all(sockets.map((socket) => socket.close()))
    },
  }
}

module.exports = {
  createSocketHookUnavailableError,
  createSocketManager,
  defaultLoadSocketIoClient,
  hasSailsSocketSupport,
}
