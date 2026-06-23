const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')

const DEFAULT_TEST_DIRECTORIES = ['tests', 'test']
const DEFAULT_JUNIT_DESTINATION = 'reports/sounding-junit.xml'
const DEFAULT_REPORTER_PATH = path.join(__dirname, 'sounding-reporter.js')
const NODE_VALUE_FLAGS = new Set([
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-shard',
  '--test-timeout',
])

/**
 * @typedef {{
 *   appPath?: string,
 *   argv?: string[],
 *   nodeExecutable?: string,
 * }} BuildTestCommandOptions
 */

/**
 * @typedef {{
 *   command: string,
 *   args: string[],
 *   cwd: string,
 *   env: Record<string, string>,
 *   files: string[],
 *   dryRun: boolean,
 * }} SoundingTestCommand
 */

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isTestFile(filePath) {
  return /\.test\.(js|cjs|mjs)$/.test(filePath)
}

/**
 * @param {string} directory
 * @returns {string[]}
 */
function listTestFiles(directory) {
  if (!fs.existsSync(directory)) {
    return []
  }

  const files = []

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const nextPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue
      }

      files.push(...listTestFiles(nextPath))
      continue
    }

    if (entry.isFile() && isTestFile(nextPath)) {
      files.push(nextPath)
    }
  }

  return files.sort()
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function hasGlob(value) {
  return /[*?[\]{}]/.test(value)
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

/**
 * @param {string} pattern
 * @returns {RegExp}
 */
function globToRegExp(pattern) {
  const normalized = pattern.split(path.sep).join('/')
  let output = '^'

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const nextChar = normalized[index + 1]
    const followingChar = normalized[index + 2]

    if (char === '*' && nextChar === '*') {
      if (followingChar === '/') {
        output += '(?:.*/)?'
        index += 2
        continue
      }

      output += '.*'
      index += 1
      continue
    }

    if (char === '*') {
      output += '[^/]*'
      continue
    }

    if (char === '?') {
      output += '[^/]'
      continue
    }

    output += escapeRegExp(char)
  }

  output += '$'
  return new RegExp(output)
}

/**
 * @param {string} pattern
 * @returns {string}
 */
function resolveGlobBase(pattern) {
  const segments = pattern.split(/[\\/]/)
  const baseSegments = []

  for (const segment of segments) {
    if (hasGlob(segment)) {
      break
    }

    baseSegments.push(segment)
  }

  return baseSegments.length > 0 ? baseSegments.join(path.sep) : '.'
}

/**
 * @param {string} appPath
 * @param {string} target
 * @returns {string[]}
 */
function resolveTargetFiles(appPath, target) {
  const absoluteTarget = path.resolve(appPath, target)

  if (hasGlob(target)) {
    const relativeBase = resolveGlobBase(target)
    const absoluteBase = path.resolve(appPath, relativeBase)
    const matcher = globToRegExp(target.split(path.sep).join('/'))

    return listTestFiles(absoluteBase).filter((filePath) => {
      const relativePath = path.relative(appPath, filePath).split(path.sep).join('/')
      return matcher.test(relativePath)
    })
  }

  if (!fs.existsSync(absoluteTarget)) {
    return []
  }

  const stat = fs.statSync(absoluteTarget)

  if (stat.isDirectory()) {
    return listTestFiles(absoluteTarget)
  }

  return isTestFile(absoluteTarget) ? [absoluteTarget] : []
}

/**
 * @param {string} appPath
 * @returns {string[]}
 */
function getChangedTestFiles(appPath) {
  try {
    const output = execFileSync('git', ['-C', appPath, 'diff', '--name-only', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .filter(isTestFile)
  } catch (_error) {
    return []
  }
}

/**
 * @param {string} value
 * @param {string} flag
 * @returns {string}
 */
function normalizeShardValue(value, flag = '--shard') {
  const match = String(value || '').match(/^(\d+)\/(\d+)$/)

  if (!match) {
    throw new Error(`Sounding test option \`${flag}\` must use part/total, for example \`--shard=1/4\`.`)
  }

  const part = Number(match[1])
  const total = Number(match[2])

  if (part < 1 || total < 1 || part > total) {
    throw new Error(`Sounding test option \`${flag}\` must use a valid part/total shard, for example \`--shard=1/4\`.`)
  }

  return `${part}/${total}`
}

/**
 * @param {string} value
 * @param {string} flag
 * @returns {string}
 */
function normalizeSlowLimit(value, flag = '--slow') {
  const limit = Number(value)

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Sounding test option \`${flag}\` must be a positive integer.`)
  }

  return String(limit)
}

/**
 * @param {string} appPath
 * @param {string[]} targets
 * @returns {string[]}
 */
function resolveTestFiles(appPath, targets) {
  const nextTargets =
    targets.length > 0
      ? targets
      : DEFAULT_TEST_DIRECTORIES.filter((directory) => fs.existsSync(path.join(appPath, directory)))

  const files = new Set()

  for (const target of nextTargets) {
    for (const filePath of resolveTargetFiles(appPath, target)) {
      files.add(path.relative(appPath, filePath))
    }
  }

  return Array.from(files).sort()
}

/**
 * @param {string[]} argv
 * @param {string} appPath
 * @returns {{
 *   appPath: string,
 *   dryRun: boolean,
 *   env: Record<string, string>,
 *   usesCustomReporter: boolean,
 *   targets: string[],
 *   nodeArgs: string[],
 * }}
 */
function parseTestArgs(argv = [], appPath = process.cwd()) {
  const args = [...argv]
  const targets = []
  const nodeArgs = []
  /** @type {Record<string, string>} */
  const env = {}
  let dryRun = false
  let useChanged = false
  let usesCustomReporter = false
  let resolvedAppPath = path.resolve(appPath)

  function readValue(flag) {
    const value = args.shift()

    if (!value || value.startsWith('--')) {
      throw new Error(`Sounding test option \`${flag}\` requires a value.`)
    }

    return value
  }

  while (args.length > 0) {
    const arg = args.shift()

    if (arg === '--dry-run') {
      dryRun = true
      continue
    }

    if (arg === '--compact') {
      env.SOUNDING_REPORTER_COMPACT = '1'
      continue
    }

    if (arg === '--profile') {
      env.SOUNDING_REPORTER_PROFILE = '1'
      continue
    }

    if (arg === '--slow') {
      env.SOUNDING_REPORTER_PROFILE = '1'
      env.SOUNDING_REPORTER_SLOW_LIMIT = normalizeSlowLimit(readValue(arg), arg)
      continue
    }

    if (arg.startsWith('--slow=')) {
      env.SOUNDING_REPORTER_PROFILE = '1'
      env.SOUNDING_REPORTER_SLOW_LIMIT = normalizeSlowLimit(arg.slice('--slow='.length), '--slow')
      continue
    }

    if (arg === '--verbose') {
      env.SOUNDING_REPORTER_VERBOSE = '1'
      env.SOUNDING_DIAGNOSTICS = 'verbose'
      continue
    }

    if (arg === '--raw-error') {
      env.SOUNDING_RAW = '1'
      continue
    }

    if (arg === '--update-snapshots') {
      env.SOUNDING_UPDATE_SNAPSHOTS = '1'
      continue
    }

    if (arg === '--app') {
      resolvedAppPath = path.resolve(readValue(arg))
      continue
    }

    if (arg === '--grep') {
      nodeArgs.push('--test-name-pattern', readValue(arg))
      continue
    }

    if (arg === '--file') {
      targets.push(readValue(arg))
      continue
    }

    if (arg === '--lane') {
      const lane = readValue(arg)
      targets.push(`tests/${lane}`)
      targets.push(`test/${lane}`)
      continue
    }

    if (arg === '--shard') {
      nodeArgs.push('--test-shard', normalizeShardValue(readValue(arg), arg))
      continue
    }

    if (arg.startsWith('--shard=')) {
      nodeArgs.push(`--test-shard=${normalizeShardValue(arg.slice('--shard='.length), '--shard')}`)
      continue
    }

    if (arg === '--parallel') {
      nodeArgs.push('--test-concurrency=true')
      continue
    }

    if (arg === '--changed') {
      useChanged = true
      continue
    }

    if (arg === '--reporter') {
      usesCustomReporter = true
      const reporter = readValue(arg)
      nodeArgs.push('--test-reporter', reporter === 'sounding' ? DEFAULT_REPORTER_PATH : reporter)
      continue
    }

    if (arg === '--reporter-destination') {
      nodeArgs.push('--test-reporter-destination', readValue(arg))
      continue
    }

    if (arg === '--junit') {
      usesCustomReporter = true
      nodeArgs.push('--test-reporter', 'junit')

      if (args[0] && !args[0].startsWith('-')) {
        nodeArgs.push('--test-reporter-destination', args.shift())
      } else {
        nodeArgs.push('--test-reporter-destination', DEFAULT_JUNIT_DESTINATION)
      }

      continue
    }

    if (arg === '--json') {
      usesCustomReporter = true
      nodeArgs.push('--test-reporter', 'json')
      continue
    }

    if (arg === '--coverage') {
      nodeArgs.push('--experimental-test-coverage')
      continue
    }

    if (arg === '--watch') {
      nodeArgs.push('--watch')
      continue
    }

    if (arg === '--') {
      nodeArgs.push(...args)
      break
    }

    if (NODE_VALUE_FLAGS.has(arg)) {
      if (arg === '--test-reporter') {
        usesCustomReporter = true
      }
      nodeArgs.push(arg, readValue(arg))
      continue
    }

    if (arg.startsWith('--test-reporter=')) {
      usesCustomReporter = true
      nodeArgs.push(arg)
      continue
    }

    if (arg.startsWith('--')) {
      nodeArgs.push(arg)
      continue
    }

    targets.push(arg)
  }

  if (useChanged) {
    targets.push(...getChangedTestFiles(resolvedAppPath))
  }

  return {
    appPath: resolvedAppPath,
    dryRun,
    env,
    usesCustomReporter,
    targets,
    nodeArgs,
  }
}

/**
 * @param {BuildTestCommandOptions} [options]
 * @returns {SoundingTestCommand}
 */
function buildTestCommand(options = {}) {
  const parsed = parseTestArgs(options.argv || [], options.appPath)
  const files = resolveTestFiles(parsed.appPath, parsed.targets)
  const reporterArgs = parsed.usesCustomReporter
    ? []
    : ['--test-reporter', DEFAULT_REPORTER_PATH]

  return {
    command: options.nodeExecutable || process.execPath,
    args: ['--test', ...reporterArgs, ...parsed.nodeArgs, ...files],
    cwd: parsed.appPath,
    env: parsed.env,
    files,
    dryRun: parsed.dryRun,
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function quoteShell(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value
  }

  return JSON.stringify(value)
}

/**
 * @param {SoundingTestCommand} command
 * @returns {string}
 */
function formatTestCommand(command) {
  const env = Object.entries(command.env || {}).map(([key, value]) => `${key}=${quoteShell(value)}`)
  return [...env, command.command, ...command.args].map(quoteShell).join(' ')
}

/**
 * @param {BuildTestCommandOptions & { stdio?: 'inherit' | 'pipe' }} [options]
 * @returns {Promise<{ status: number, command: SoundingTestCommand }>}
 */
function runTests(options = {}) {
  const command = buildTestCommand(options)

  if (command.dryRun) {
    return Promise.resolve({
      status: 0,
      command,
    })
  }

  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: {
        ...process.env,
        ...(command.env || {}),
      },
      stdio: options.stdio || 'inherit',
    })

    child.on('exit', (code, signal) => {
      resolve({
        status: code ?? (signal ? 1 : 0),
        command,
      })
    })
  })
}

module.exports = {
  DEFAULT_JUNIT_DESTINATION,
  DEFAULT_TEST_DIRECTORIES,
  DEFAULT_REPORTER_PATH,
  buildTestCommand,
  formatTestCommand,
  parseTestArgs,
  resolveTestFiles,
  runTests,
}
