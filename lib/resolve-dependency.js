const path = require('node:path')

const { createSoundingError } = require('./create-error')

/** @typedef {import('./types').AnyRecord} AnyRecord */

/**
 * @param {unknown} error
 * @returns {error is Error & { code: string }}
 */
function isMissingModuleError(error) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
  )
}

/**
 * @param {{
 *   moduleId: string,
 *   dependency?: string,
 *   purpose?: string,
 *   install?: string,
 *   suggestion?: string,
 *   appPath?: string,
 *   cause?: unknown,
 * }} input
 * @returns {Error}
 */
function createMissingDependencyError({
  moduleId,
  dependency = moduleId,
  purpose,
  install,
  suggestion,
  appPath,
  cause,
}) {
  const reason = purpose ? ` Sounding needs it to ${purpose}.` : ''
  const installHint = install ? ` Install it with: \`${install}\`.` : ''
  const suggestionHint = suggestion ? ` ${suggestion}` : ''

  return createSoundingError({
    code: 'E_SOUNDING_DEPENDENCY_MISSING',
    name: 'SoundingDependencyError',
    message: `Sounding could not find dependency \`${dependency}\`.${reason}${installHint}${suggestionHint}`,
    details: {
      moduleId,
      dependency,
      purpose,
      install,
      suggestion,
      appPath,
    },
    cause,
  })
}

/**
 * @param {{
 *   appPath?: string,
 *   moduleId: string,
 *   dependency?: string,
 *   purpose?: string,
 *   install?: string,
 *   suggestion?: string,
 *   optional?: boolean,
 *   resolveImplementation?: (moduleId: string, options?: { paths?: string[] }) => string,
 *   paths?: string[],
 * }} input
 * @returns {string | null}
 */
function resolveDependencyFromApp({
  appPath = process.cwd(),
  moduleId,
  dependency = moduleId,
  purpose,
  install,
  suggestion,
  optional = false,
  resolveImplementation = require.resolve,
  paths,
}) {
  const resolvedAppPath = path.resolve(appPath)
  const searchPaths = paths || [resolvedAppPath, process.cwd(), __dirname]

  try {
    return resolveImplementation(moduleId, { paths: searchPaths })
  } catch (error) {
    if (optional && isMissingModuleError(error)) {
      return null
    }

    if (isMissingModuleError(error)) {
      throw createMissingDependencyError({
        moduleId,
        dependency,
        purpose,
        install,
        suggestion,
        appPath: resolvedAppPath,
        cause: error,
      })
    }

    throw error
  }
}

/**
 * @param {{
 *   appPath?: string,
 *   moduleId: string,
 *   dependency?: string,
 *   purpose?: string,
 *   install?: string,
 *   suggestion?: string,
 *   optional?: boolean,
 *   resolveImplementation?: (moduleId: string, options?: { paths?: string[] }) => string,
 *   requireImplementation?: (resolvedPath: string) => any,
 *   paths?: string[],
 * }} input
 * @returns {any}
 */
function loadDependencyFromApp({
  requireImplementation = require,
  ...options
}) {
  const resolvedPath = resolveDependencyFromApp(options)

  if (!resolvedPath) {
    return null
  }

  return requireImplementation(resolvedPath)
}

module.exports = {
  createMissingDependencyError,
  isMissingModuleError,
  loadDependencyFromApp,
  resolveDependencyFromApp,
}
