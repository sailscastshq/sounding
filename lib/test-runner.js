const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')

const DEFAULT_TEST_DIRECTORIES = ['tests', 'test']
const DEFAULT_JUNIT_DESTINATION = 'reports/sounding-junit.xml'
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
 *   targets: string[],
 *   nodeArgs: string[],
 * }}
 */
function parseTestArgs(argv = [], appPath = process.cwd()) {
  const args = [...argv]
  const targets = []
  const nodeArgs = []
  let dryRun = false
  let useChanged = false
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

    if (arg === '--changed') {
      useChanged = true
      continue
    }

    if (arg === '--reporter') {
      nodeArgs.push('--test-reporter', readValue(arg))
      continue
    }

    if (arg === '--reporter-destination') {
      nodeArgs.push('--test-reporter-destination', readValue(arg))
      continue
    }

    if (arg === '--junit') {
      nodeArgs.push('--test-reporter', 'junit')

      if (args[0] && !args[0].startsWith('-')) {
        nodeArgs.push('--test-reporter-destination', args.shift())
      } else {
        nodeArgs.push('--test-reporter-destination', DEFAULT_JUNIT_DESTINATION)
      }

      continue
    }

    if (arg === '--json') {
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
      nodeArgs.push(arg, readValue(arg))
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

  return {
    command: options.nodeExecutable || process.execPath,
    args: ['--test', ...parsed.nodeArgs, ...files],
    cwd: parsed.appPath,
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
  return [command.command, ...command.args].map(quoteShell).join(' ')
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
  buildTestCommand,
  formatTestCommand,
  parseTestArgs,
  resolveTestFiles,
  runTests,
}
