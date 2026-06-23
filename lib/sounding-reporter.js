const fs = require('node:fs')
const path = require('node:path')

const INTERNAL_FRAME_PATTERN = /(?:^|\/)(?:node:internal|internal\/|node_modules\/internal)/

function supportsColor() {
  if (process.env.NO_COLOR || process.env.FORCE_COLOR === '0') {
    return false
  }

  return Boolean(process.env.FORCE_COLOR || process.stdout.isTTY)
}

function colorize(enabled, code, value) {
  return enabled ? `\u001b[${code}m${value}\u001b[0m` : value
}

function createTheme() {
  const color = supportsColor()

  return {
    color,
    red(value) {
      return colorize(color, '31', value)
    },
    green(value) {
      return colorize(color, '32', value)
    },
    dim(value) {
      return colorize(color, '2', value)
    },
    bold(value) {
      return colorize(color, '1', value)
    },
    cyan(value) {
      return colorize(color, '36', value)
    },
    passBadge(value) {
      return color ? colorize(color, '30;42;1', ` ${value} `) : value
    },
    failBadge(value) {
      return color ? colorize(color, '30;41;1', ` ${value} `) : value
    },
  }
}

function isVerbose() {
  return process.env.SOUNDING_REPORTER_VERBOSE === '1' || process.env.SOUNDING_DIAGNOSTICS === 'verbose'
}

function isCompact() {
  return process.env.SOUNDING_REPORTER_COMPACT === '1'
}

function isRaw() {
  return process.env.SOUNDING_RAW === '1' || process.env.SOUNDING_RAW_ERROR === '1'
}

function shouldListPassedTests(summary) {
  if (isCompact()) {
    return false
  }

  if (isVerbose() || process.env.SOUNDING_REPORTER_LIST === '1') {
    return true
  }

  return (summary?.counts?.tests || 0) <= 12
}

function formatDuration(durationMs) {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs)) {
    return ''
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`
  }

  return `${(durationMs / 1000).toFixed(2)}s`
}

function safeRealpath(filePath) {
  try {
    return fs.realpathSync(filePath)
  } catch (_error) {
    return filePath
  }
}

function isInside(filePath, directory) {
  const relative = path.relative(directory, filePath)
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function normalizeFileUrl(value) {
  if (typeof value !== 'string') {
    return value
  }

  if (!value.startsWith('file://')) {
    return value
  }

  try {
    return new URL(value).pathname
  } catch (_error) {
    return value
  }
}

function isObject(value) {
  return Boolean(value && typeof value === 'object')
}

function parseStackFrames(stack) {
  if (!stack) {
    return []
  }

  return String(stack)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const parenMatch = line.match(/\((.*):(\d+):(\d+)\)$/)
      const plainMatch = parenMatch ? null : line.match(/at (.*):(\d+):(\d+)$/)
      const match = parenMatch || plainMatch

      if (!match) {
        return null
      }

      return {
        file: normalizeFileUrl(match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
      }
    })
    .filter(Boolean)
}

function getOriginalError(data) {
  return data?.details?.error
}

function getFailureError(data) {
  const error = data?.details?.error
  return error?.cause && typeof error.cause === 'object' ? error.cause : error
}

function getErrorObjects(error) {
  const errors = []
  const seen = new Set()
  let current = error

  while (isObject(current) && !seen.has(current)) {
    seen.add(current)
    errors.push(current)
    current = current.cause
  }

  return errors
}

function resolveFailureLocation(data) {
  const originalError = getOriginalError(data)
  const error = getFailureError(data)
  const root = safeRealpath(process.cwd())
  const frames = [
    ...parseStackFrames(error?.stack),
    ...(originalError && originalError !== error ? parseStackFrames(originalError.stack) : []),
  ]
  const userFrame = frames.find((frame) => {
    if (!frame.file || INTERNAL_FRAME_PATTERN.test(frame.file)) {
      return false
    }

    return isInside(safeRealpath(frame.file), root)
  })

  if (userFrame) {
    return userFrame
  }

  return {
    file: data.file,
    line: data.line,
    column: data.column,
  }
}

function formatPath(filePath) {
  if (!filePath) {
    return ''
  }

  const relative = path.relative(process.cwd(), filePath)

  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/')
  }

  return filePath
}

function indentLines(value, prefix = '  ') {
  return String(value)
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

function stripTrailingBlankLines(value) {
  return String(value).replace(/\s+$/g, '')
}

function splitMarkedBlock(message, marker) {
  const index = message.indexOf(marker)

  if (index === -1) {
    return {
      before: stripTrailingBlankLines(message),
      lines: [],
    }
  }

  return {
    before: stripTrailingBlankLines(message.slice(0, index)),
    lines: message
      .slice(index + marker.length)
      .split(/\r?\n/)
      .map((line) => line.replace(/^- /, '').trim())
      .filter(Boolean),
  }
}

function parseSoundingDiagnostics(message) {
  const marker = '\n\nSounding response diagnostics:\n'
  const block = splitMarkedBlock(message, marker)

  if (block.lines.length === 0) {
    return {
      message: stripTrailingBlankLines(message),
      diagnostics: null,
    }
  }

  const diagnostics = {}

  for (const line of block.lines) {
    const separatorIndex = line.indexOf(':')

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex)
    const value = line.slice(separatorIndex + 1).trim()
    diagnostics[key] = value
  }

  return {
    message: block.before,
    diagnostics,
  }
}

function parseBrowserArtifactDiagnostics(message) {
  const block = splitMarkedBlock(message, '\n\nSounding browser artifacts:\n')

  if (block.lines.length === 0) {
    return {
      message: stripTrailingBlankLines(message),
      browserArtifacts: null,
    }
  }

  const browserArtifacts = {
    errors: [],
  }

  for (const line of block.lines) {
    const separatorIndex = line.indexOf(':')

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()

    if (key === 'URL') {
      browserArtifacts.currentUrl = value
    } else if (key === 'current URL file') {
      browserArtifacts.currentUrlPath = value
    } else if (key === 'screenshot') {
      browserArtifacts.screenshot = value
    } else if (key === 'trace') {
      browserArtifacts.trace = value
    } else if (key === 'video') {
      browserArtifacts.video = value
    } else if (key.endsWith(' capture failed')) {
      browserArtifacts.errors.push({
        artifact: key.replace(/ capture failed$/, ''),
        message: value,
      })
    }
  }

  return {
    message: block.before,
    browserArtifacts,
  }
}

function formatMetadataValue(value) {
  if (value === undefined || value === null || value === '') {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch (_error) {
    return String(value)
  }
}

function createMetadataRow(label, value) {
  const formatted = formatMetadataValue(value)

  if (!formatted) {
    return null
  }

  return {
    label,
    value: formatted,
  }
}

function hasRows(section) {
  return section?.rows?.length > 0
}

function createMetadataGroups(input) {
  const diagnostics = input?.diagnostics
  const sounding = input?.sounding && typeof input.sounding === 'object' ? input.sounding : {}
  const browserArtifacts = input?.browserArtifacts || sounding.browserArtifacts
  const groups = []

  if (sounding.world) {
    const worldRows = [
      createMetadataRow('scenario', sounding.world.name || sounding.world.scenario),
      createMetadataRow('actor', sounding.world.actor),
      createMetadataRow(
        'context',
        sounding.world.context && Object.keys(sounding.world.context).length > 0
          ? sounding.world.context
          : null
      ),
    ].filter(Boolean)

    if (worldRows.length > 0) {
      groups.push({
        title: 'World',
        sections: [
          {
            rows: worldRows,
          },
        ],
      })
    }
  }

  if (diagnostics) {
    const requestRows = [
      createMetadataRow(null, diagnostics.Request || diagnostics.URL),
      createMetadataRow('headers', diagnostics['Request headers']),
    ].filter(Boolean)
    const responseRows = [
      createMetadataRow(null, diagnostics.Response),
      createMetadataRow('headers', diagnostics.Headers),
    ].filter(Boolean)
    const bodyRows = [createMetadataRow(null, diagnostics.Body)].filter(Boolean)

    if (requestRows.length > 0) {
      groups.push({
        title: 'Request',
        sections: [
          {
            rows: requestRows,
          },
        ],
      })
    }

    if (responseRows.length > 0) {
      groups.push({
        title: 'Response',
        sections: [
          {
            rows: responseRows,
          },
        ],
      })
    }

    if (bodyRows.length > 0) {
      groups.push({
        title: 'Body',
        sections: [
          {
            rows: bodyRows,
          },
        ],
      })
    }
  }

  if (browserArtifacts) {
    const errorRows = (browserArtifacts.errors || [])
      .map((error) => createMetadataRow(`${error.artifact} error`, error.message))
      .filter(Boolean)
    const browserRows = [
      createMetadataRow('project', browserArtifacts.project),
      createMetadataRow('trial', browserArtifacts.trialName),
      createMetadataRow('url', browserArtifacts.currentUrl),
      createMetadataRow('current URL file', browserArtifacts.currentUrlPath),
      createMetadataRow('screenshot', browserArtifacts.screenshot),
      createMetadataRow('trace', browserArtifacts.trace),
      createMetadataRow('video', browserArtifacts.video),
      ...errorRows,
    ].filter(Boolean)

    if (browserRows.length > 0) {
      groups.push({
        title: 'Browser',
        sections: [
          {
            rows: browserRows,
          },
        ],
      })
    }
  }

  return groups
}

function formatMetadataGroups(groups, theme) {
  const renderedGroups = []

  for (const group of groups || []) {
    const lines = [`  ${theme.bold(group.title)}`]

    for (const section of group.sections || []) {
      if (!hasRows(section)) {
        continue
      }

      if (section.title) {
        lines.push(`    ${theme.dim(section.title)}`)
      }

      for (const row of section.rows) {
        if (row.label) {
          lines.push(`    ${theme.dim(`${row.label}:`)} ${row.value}`)
        } else {
          lines.push(`    ${row.value}`)
        }
      }
    }

    if (lines.length > 1) {
      renderedGroups.push(lines.join('\n'))
    }
  }

  return renderedGroups.join('\n\n')
}

function defaultSourceLoader(location) {
  if (!location?.file || !fs.existsSync(location.file)) {
    return null
  }

  return fs.readFileSync(location.file, 'utf8')
}

function normalizeSourceResult(sourceResult) {
  if (!sourceResult) {
    return null
  }

  if (typeof sourceResult === 'string') {
    return sourceResult
  }

  if (Array.isArray(sourceResult)) {
    return sourceResult.join('\n')
  }

  if (typeof sourceResult.source === 'string') {
    return sourceResult.source
  }

  if (Array.isArray(sourceResult.lines)) {
    return sourceResult.lines.join('\n')
  }

  return null
}

function createCodeFrame(location, options = {}) {
  if (!location?.file || !location.line) {
    return null
  }

  const sourceLoader = options.sourceLoader || defaultSourceLoader
  const sourceText = normalizeSourceResult(sourceLoader(location))

  if (!sourceText) {
    return null
  }

  const source = sourceText.split(/\r?\n/)
  const start = Math.max(1, location.line - 3)
  const end = Math.min(source.length, location.line + 2)
  const width = String(end).length
  const lines = []

  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    lines.push({
      highlighted: lineNumber === location.line,
      lineNumber,
      source: source[lineNumber - 1],
    })
  }

  return {
    location,
    start,
    end,
    width,
    lines,
  }
}

function formatCodeFrame(codeFrame, theme) {
  if (!codeFrame) {
    return ''
  }

  return codeFrame.lines
    .map((line) => {
      const marker = line.highlighted ? '->' : '  '
      const number = String(line.lineNumber).padStart(codeFrame.width, ' ')
      const renderedMarker = line.highlighted ? theme.red(marker) : theme.dim(marker)
      const renderedNumber = line.highlighted ? theme.red(number) : theme.dim(number)

      return `  ${renderedMarker} ${renderedNumber}  ${line.source}`
    })
    .join('\n')
}

function serializeValue(value, depth = 0, seen = new Set()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') {
      return value.toString()
    }

    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`
    }

    return value
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  if (depth >= 4) {
    return '[MaxDepth]'
  }

  seen.add(value)

  if (Array.isArray(value)) {
    const output = value.map((item) => serializeValue(item, depth + 1, seen))
    seen.delete(value)
    return output
  }

  const output = {}

  for (const key of Object.keys(value)) {
    if (key === 'stack') {
      continue
    }

    output[key] = serializeValue(value[key], depth + 1, seen)
  }

  seen.delete(value)
  return output
}

function serializeError(error, seen = new Set()) {
  if (!isObject(error)) {
    return serializeValue(error, 0, seen)
  }

  if (seen.has(error)) {
    return '[Circular]'
  }

  seen.add(error)

  const output = {
    name: error.name,
    message: error.message,
  }

  for (const key of ['code', 'failureType', 'operator']) {
    if (error[key] !== undefined) {
      output[key] = serializeValue(error[key], 1, seen)
    }
  }

  for (const key of ['actual', 'expected', 'details', 'sounding']) {
    if (error[key] !== undefined) {
      output[key] = serializeValue(error[key], 1, seen)
    }
  }

  if (typeof error.stack === 'string') {
    output.stack = error.stack
  }

  if (error.cause !== undefined) {
    output.cause = serializeError(error.cause, seen)
  }

  seen.delete(error)
  return output
}

function createRawPayload(failure) {
  return {
    event: {
      name: failure.name,
      file: failure.event.file,
      line: failure.event.line,
      column: failure.event.column,
      failureType: failure.originalError?.failureType,
    },
    primaryFrame: failure.primaryFrame,
    metadata: failure.metadataGroups,
    error: serializeError(failure.originalError || failure.error),
  }
}

function formatRawSection(payload, theme) {
  return [`  ${theme.bold('Raw')}`, indentLines(JSON.stringify(payload, null, 2), '    ')].join('\n')
}

function summarizeErrorMessage(message) {
  return stripTrailingBlankLines(String(message || ''))
    .split(/\r?\n\r?\n/)[0]
    .replace(/\s+/g, ' ')
}

function formatCauseChain(causeChain, theme) {
  if (!causeChain || causeChain.length <= 1) {
    return ''
  }

  return [
    `  ${theme.bold('Caused by')}`,
    ...causeChain.slice(1).map((error) => {
      const name = error?.name || 'Error'
      const message = summarizeErrorMessage(error?.message || String(error))
      return `    ${name}: ${message}`
    }),
  ].join('\n')
}

function parseFailure(data, options = {}) {
  const originalError = getOriginalError(data)
  const error = getFailureError(data)
  const rawMessage = error?.message || originalError?.message || 'Test failed.'
  const parsedDiagnostics = parseSoundingDiagnostics(rawMessage)
  const parsedBrowserArtifacts = parseBrowserArtifactDiagnostics(parsedDiagnostics.message)
  const sounding = {
    ...(isObject(originalError?.sounding) ? originalError.sounding : {}),
    ...(isObject(error?.sounding) ? error.sounding : {}),
  }
  const browserArtifacts =
    sounding.browserArtifacts ||
    error?.details?.browserArtifacts ||
    originalError?.details?.browserArtifacts ||
    parsedBrowserArtifacts.browserArtifacts
  const metadataGroups = createMetadataGroups({
    diagnostics: parsedDiagnostics.diagnostics,
    sounding,
    browserArtifacts,
  })
  const primaryFrame = resolveFailureLocation(data)
  const codeFrame = createCodeFrame(primaryFrame, {
    sourceLoader: options.sourceLoader,
  })
  const causeChain = getErrorObjects(originalError || error)

  return {
    type: 'SoundingFailure',
    name: data.name || 'anonymous trial',
    event: data,
    originalError,
    error,
    message: parsedBrowserArtifacts.message || 'Test failed.',
    diagnostics: parsedDiagnostics.diagnostics,
    metadataGroups,
    browserArtifacts,
    causeChain,
    primaryFrame,
    codeFrame,
  }
}

function renderFailure(failure, options = {}) {
  const theme = options.theme || createTheme()
  const verbose = options.verbose ?? isVerbose()
  const raw = options.raw ?? isRaw()
  const relativeLocation = failure.primaryFrame?.file
    ? `${formatPath(failure.primaryFrame.file)}${failure.primaryFrame.line ? `:${failure.primaryFrame.line}` : ''}`
    : ''
  const lines = [
    `  ${theme.red('×')} ${theme.bold(failure.name)}`,
    '',
    indentLines(failure.message),
  ]
  const renderedMetadata = formatMetadataGroups(failure.metadataGroups, theme)
  const codeFrame = formatCodeFrame(failure.codeFrame, theme)
  const renderedCauseChain = formatCauseChain(failure.causeChain, theme)

  if (renderedMetadata) {
    lines.push('', renderedMetadata)
  }

  if (relativeLocation) {
    lines.push('', `  ${theme.dim('at')} ${theme.cyan(relativeLocation)}`)
  }

  if (codeFrame) {
    lines.push('', codeFrame)
  }

  if ((verbose || raw) && renderedCauseChain) {
    lines.push('', renderedCauseChain)
  }

  if (verbose && failure.error?.stack) {
    lines.push('', theme.dim(indentLines(failure.error.stack, '  ')))
  }

  if (raw) {
    lines.push('', formatRawSection(createRawPayload(failure), theme))
  }

  return lines.join('\n')
}

function formatFailure(data, options = {}) {
  return renderFailure(parseFailure(data, options), options)
}

function shouldReportFailure(data) {
  const failureType = data?.details?.error?.failureType

  return failureType !== 'subtestsFailed'
}

function formatSummary(summary, theme) {
  const counts = summary?.counts || {}
  const failed = counts.failed || 0
  const passed = counts.passed || 0
  const skipped = counts.skipped || 0
  const todo = counts.todo || 0
  const cancelled = counts.cancelled || 0
  const total = counts.tests || 0
  const parts = [
    passed ? theme.green(`${passed} passed`) : '',
    failed ? theme.red(`${failed} failed`) : '',
    skipped ? `${skipped} skipped` : '',
    todo ? `${todo} todo` : '',
    cancelled ? theme.red(`${cancelled} cancelled`) : '',
    `${total} total`,
  ].filter(Boolean)
  const duration = formatDuration(summary?.duration_ms)
  const label = failed || cancelled ? theme.failBadge('FAIL') : theme.passBadge('PASS')

  return [
    `${label}  Tests: ${parts.join(', ')}`,
    `${theme.dim('Duration:')} ${theme.bold(duration || 'unknown')}`,
    '',
  ].join('\n')
}

function formatPassLine(test, width, theme) {
  const duration = formatDuration(test?.details?.duration_ms)
  const name = test.name || 'anonymous trial'
  const paddedName = duration && name.length < width ? name.padEnd(width, ' ') : name
  const suffix = duration ? `  ${theme.dim(duration)}` : ''

  return `  ${theme.green('✓')} ${paddedName}${suffix}`
}

function formatPassedGroups(passedTests, theme) {
  if (passedTests.length === 0) {
    return ''
  }

  const groups = new Map()
  const maxNameLength = Math.min(
    64,
    Math.max(...passedTests.map((test) => String(test.name || '').length), 0)
  )

  for (const passedTest of passedTests) {
    const file = formatPath(passedTest.file || passedTest.name)
    const tests = groups.get(file) || []
    tests.push(passedTest)
    groups.set(file, tests)
  }

  return Array.from(groups.entries())
    .map(([file, tests]) => {
      const lines = [
        `${theme.green(theme.bold('PASS'))}  ${file}`,
        '',
        ...tests.map((test) => formatPassLine(test, maxNameLength, theme)),
      ]

      return lines.join('\n')
    })
    .join('\n\n')
}

async function* soundingReporter(source) {
  const theme = createTheme()
  const reportedFiles = new Set()
  const passedTests = []

  for await (const event of source) {
    if (event.type === 'test:stdout' || event.type === 'test:stderr') {
      yield event.data.message
      continue
    }

    if (event.type === 'test:fail' && shouldReportFailure(event.data)) {
      const location = resolveFailureLocation(event.data)
      const file = formatPath(location.file || event.data.file || event.data.name)

      if (!reportedFiles.has(file)) {
        reportedFiles.add(file)
        yield `\n${theme.red(theme.bold('FAIL'))}  ${file}\n\n`
      }

      yield `${formatFailure(event.data, { theme })}\n\n`
      continue
    }

    if (event.type === 'test:pass') {
      passedTests.push(event.data)
      continue
    }

    if (event.type === 'test:summary' && !event.data.file) {
      if (event.data.success && shouldListPassedTests(event.data)) {
        const passedGroups = formatPassedGroups(passedTests, theme)
        if (passedGroups) {
          yield `\n${passedGroups}\n\n`
        }
      }

      yield `${formatSummary(event.data, theme)}`
    }
  }
}

module.exports = soundingReporter
module.exports.createCodeFrame = createCodeFrame
module.exports.createMetadataGroups = createMetadataGroups
module.exports.defaultSourceLoader = defaultSourceLoader
module.exports.formatFailure = formatFailure
module.exports.formatMetadataGroups = formatMetadataGroups
module.exports.formatPassedGroups = formatPassedGroups
module.exports.formatSummary = formatSummary
module.exports.parseFailure = parseFailure
module.exports.parseSoundingDiagnostics = parseSoundingDiagnostics
module.exports.renderFailure = renderFailure
module.exports.resolveFailureLocation = resolveFailureLocation
