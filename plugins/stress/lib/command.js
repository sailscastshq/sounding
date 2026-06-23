const { createStressClient } = require('./create-stress-client')
const { formatStressResult } = require('./result')

const METHOD_FLAGS = {
  '--get': 'GET',
  '--head': 'HEAD',
  '--options': 'OPTIONS',
  '--post': 'POST',
  '--put': 'PUT',
  '--patch': 'PATCH',
  '--delete': 'DELETE',
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value)
}

/**
 * @param {string} value
 * @returns {any}
 */
function parseJson(value) {
  return JSON.parse(value)
}

/**
 * @param {string} value
 * @returns {[string, string]}
 */
function parseHeader(value) {
  const colon = value.indexOf(':')

  if (colon !== -1) {
    return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()]
  }

  const equals = value.indexOf('=')
  if (equals !== -1) {
    return [value.slice(0, equals).trim(), value.slice(equals + 1).trim()]
  }

  return [value.trim(), '']
}

/**
 * @param {string[]} argv
 */
function parseStressArgs(argv) {
  const args = [...argv]
  const options = {
    method: 'GET',
    headers: {},
  }

  function readValue(flag) {
    const value = args.shift()

    if (!value || value.startsWith('--')) {
      throw new Error(`Sounding stress option \`${flag}\` requires a value.`)
    }

    return value
  }

  while (args.length > 0) {
    const arg = args.shift()

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--duration') {
      options.duration = Number(readValue(arg))
      continue
    }

    if (arg.startsWith('--duration=')) {
      options.duration = Number(arg.slice('--duration='.length))
      continue
    }

    if (arg === '--concurrency' || arg === '--connections') {
      options.concurrency = Number(readValue(arg))
      continue
    }

    if (arg.startsWith('--concurrency=')) {
      options.concurrency = Number(arg.slice('--concurrency='.length))
      continue
    }

    if (arg.startsWith('--connections=')) {
      options.concurrency = Number(arg.slice('--connections='.length))
      continue
    }

    if (arg === '--method') {
      options.method = readValue(arg).toUpperCase()
      continue
    }

    if (arg.startsWith('--method=')) {
      options.method = arg.slice('--method='.length).toUpperCase()
      continue
    }

    if (arg === '--header') {
      const [name, value] = parseHeader(readValue(arg))
      options.headers[name] = value
      continue
    }

    if (arg.startsWith('--header=')) {
      const [name, value] = parseHeader(arg.slice('--header='.length))
      options.headers[name] = value
      continue
    }

    if (arg === '--json') {
      options.payload = parseJson(readValue(arg))
      options.headers['content-type'] = 'application/json'
      continue
    }

    if (arg.startsWith('--json=')) {
      options.payload = parseJson(arg.slice('--json='.length))
      options.headers['content-type'] = 'application/json'
      continue
    }

    if (arg === '--body') {
      options.payload = readValue(arg)
      continue
    }

    if (arg.startsWith('--body=')) {
      options.payload = arg.slice('--body='.length)
      continue
    }

    if (arg === '--base-url') {
      options.baseUrl = readValue(arg)
      continue
    }

    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length)
      continue
    }

    if (arg === '--world') {
      options.world = readValue(arg)
      continue
    }

    if (arg.startsWith('--world=')) {
      options.world = arg.slice('--world='.length)
      continue
    }

    if (arg === '--as') {
      options.actor = readValue(arg)
      continue
    }

    if (arg.startsWith('--as=')) {
      options.actor = arg.slice('--as='.length)
      continue
    }

    const methodFlag = Object.keys(METHOD_FLAGS).find(
      (flag) => arg === flag || arg.startsWith(`${flag}=`)
    )

    if (methodFlag) {
      options.method = METHOD_FLAGS[methodFlag]

      if (arg.startsWith(`${methodFlag}=`)) {
        options.payload = parseJson(arg.slice(methodFlag.length + 1))
        options.headers['content-type'] = 'application/json'
      }

      continue
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown Sounding stress option: ${arg}`)
    }

    if (!options.target) {
      options.target = arg
      continue
    }

    throw new Error(`Unexpected Sounding stress argument: ${arg}`)
  }

  return options
}

function printStressHelp(stdout) {
  stdout.write(`Sounding stress

Usage:
  sounding stress <target> [options]

Targets:
  /api/health                         Stress a local Sails app route.
  https://example.com/api/health      Stress an external URL directly.
  /api/health --base-url=<url>        Stress a Sails-shaped path on a chosen host.

Options:
  --duration <seconds>                Duration in seconds. Defaults to 10.
  --concurrency <requests>            Concurrent requests. Defaults to 1.
  --method <method>                   HTTP method.
  --get, --post, --put, --patch       Method shorthands. Body-capable flags accept JSON.
  --delete, --head, --options         More method shorthands.
  --header "Name: value"              Add a request header. May be repeated.
  --json '<payload>'                  Send a JSON body.
  --body <payload>                    Send a raw body.
  --world <scenario>                  Load a Sounding world before stressing a local app.
  --as <actor>                        Use a world actor alias for local Sails auth/session.
`)
}

/**
 * @param {any} value
 * @param {string} name
 * @param {any} api
 */
function assertPositiveInteger(value, name, api) {
  if (value === undefined) {
    return undefined
  }

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
 * @param {any} options
 * @returns {boolean}
 */
function needsLocalSailsApp(options) {
  if (!options.target) {
    return false
  }

  if (options.world || options.actor) {
    return true
  }

  return !isAbsoluteUrl(options.target) && !options.baseUrl
}

/**
 * @param {ReturnType<typeof createStressClient>} stress
 * @param {any} options
 */
function createStressRun(stress, options) {
  let chain = stress.request(options.method, options.target, options.payload)

  if (options.baseUrl) {
    chain = chain.baseUrl(options.baseUrl)
  }

  if (Object.keys(options.headers || {}).length > 0) {
    chain = chain.headers(options.headers)
  }

  if (options.actor) {
    chain = chain.as(options.actor)
  }

  if (options.concurrency) {
    chain = chain.concurrently(options.concurrency)
  }

  if (options.duration) {
    return chain.for(options.duration).seconds()
  }

  return chain.run()
}

/**
 * @param {string[]} argv
 * @param {{ api: any, appPath: string, stdout: NodeJS.WriteStream }} context
 */
async function runStressCommand(argv, context) {
  const options = parseStressArgs(argv)
  const api = context.api

  if (options.help) {
    printStressHelp(context.stdout)
    return {
      status: 0,
    }
  }

  if (!options.target) {
    throw new Error('Sounding stress requires a target URL or path.')
  }

  options.duration = assertPositiveInteger(options.duration, 'duration', api)
  options.concurrency = assertPositiveInteger(options.concurrency, 'concurrency', api)

  if (options.baseUrl && (options.world || options.actor)) {
    throw api.createSoundingError({
      code: 'E_SOUNDING_STRESS_REMOTE_ACTOR_UNSUPPORTED',
      name: 'SoundingStressError',
      message:
        'Sounding stress `--world` and `--as` need a local lifted Sails app. Use headers for remote or --base-url targets.',
    })
  }

  if (!needsLocalSailsApp(options)) {
    const stress = createStressClient({
      api,
      events: api.events,
    })
    const result = await createStressRun(stress, options)
    context.stdout.write(`${formatStressResult(result)}\n`)
    return {
      status: result.requests.failed().count() > 0 ? 1 : 0,
    }
  }

  const appManager = api.createAppManager({
    appPath: context.appPath,
  })

  try {
    const runtime = await appManager.runtime({ app: 'lift' })
    const booted = await runtime.boot({ mode: 'stress' })

    if (options.world) {
      await runtime.world.use(options.world)
    }

    const stress = createStressClient({
      api,
      sails: booted.sails,
      getConfig: () => runtime.config,
      world: runtime.world,
      appPath: context.appPath,
      events: api.events,
    })
    const result = await createStressRun(stress, options)
    context.stdout.write(`${formatStressResult(result)}\n`)

    return {
      status: result.requests.failed().count() > 0 ? 1 : 0,
    }
  } finally {
    await appManager.lower()
  }
}

module.exports = {
  parseStressArgs,
  runStressCommand,
}
