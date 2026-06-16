const fs = require('node:fs')
const path = require('node:path')

const packageJson = require('../package.json')

const TEST_COMMAND = 'sounding test'
const SOUNDING_VERSION = `^${packageJson.version}`
const SQLITE_VERSION = packageJson.devDependencies?.['sails-sqlite'] || '^0.2.6'

/**
 * @typedef {{
 *   type: 'created' | 'updated' | 'skipped',
 *   path?: string,
 *   message: string,
 * }} InitProjectAction
 */

/**
 * @typedef {{
 *   appPath?: string,
 *   config?: boolean,
 * }} InitProjectOptions
 */

/**
 * @typedef {{
 *   appPath: string,
 *   auth: {
 *     identity: string,
 *     modelName: string,
 *     collection: string,
 *     scenario: string,
 *     detected: boolean,
 *   },
 *   actions: InitProjectAction[],
 * }} InitProjectResult
 */

/**
 * @param {string} value
 * @returns {string}
 */
function titleCase(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`
}

/**
 * @param {string} value
 * @returns {string}
 */
function pluralize(value) {
  if (value.endsWith('s')) {
    return value
  }

  return `${value}s`
}

/**
 * @param {string} appPath
 * @returns {InitProjectResult['auth']}
 */
function detectAuthConvention(appPath) {
  const candidates = ['user', 'creator']

  for (const identity of candidates) {
    const modelName = titleCase(identity)
    const modelPaths = [
      path.join(appPath, 'api', 'models', `${modelName}.js`),
      path.join(appPath, 'api', 'models', `${identity}.js`),
    ]

    if (modelPaths.some((modelPath) => fs.existsSync(modelPath))) {
      return {
        identity,
        modelName,
        collection: pluralize(identity),
        scenario: `signed-in-${identity}`,
        detected: true,
      }
    }
  }

  return {
    identity: 'user',
    modelName: 'User',
    collection: 'users',
    scenario: 'signed-in-user',
    detected: false,
  }
}

/**
 * @param {string} filePath
 * @returns {any}
 */
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

/**
 * @param {string} filePath
 * @param {any} value
 * @returns {void}
 */
function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * @param {string} appPath
 * @param {string} targetPath
 * @returns {string}
 */
function formatPath(appPath, targetPath) {
  return path.relative(appPath, targetPath) || path.basename(targetPath)
}

/**
 * @param {InitProjectAction[]} actions
 * @param {string} appPath
 * @param {string} directory
 * @returns {void}
 */
function ensureDirectory(actions, appPath, directory) {
  if (fs.existsSync(directory)) {
    actions.push({
      type: 'skipped',
      path: directory,
      message: `Kept existing ${formatPath(appPath, directory)}`,
    })
    return
  }

  fs.mkdirSync(directory, { recursive: true })
  actions.push({
    type: 'created',
    path: directory,
    message: `Created ${formatPath(appPath, directory)}`,
  })
}

/**
 * @param {InitProjectAction[]} actions
 * @param {string} appPath
 * @param {string} filePath
 * @param {string} contents
 * @returns {void}
 */
function writeFileIfMissing(actions, appPath, filePath, contents) {
  if (fs.existsSync(filePath)) {
    actions.push({
      type: 'skipped',
      path: filePath,
      message: `Kept existing ${formatPath(appPath, filePath)}`,
    })
    return
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
  actions.push({
    type: 'created',
    path: filePath,
    message: `Created ${formatPath(appPath, filePath)}`,
  })
}

/**
 * @param {any} pkg
 * @param {string} name
 * @returns {boolean}
 */
function hasDependency(pkg, name) {
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name])
}

/**
 * @param {any} pkg
 * @param {string} name
 * @param {string} version
 * @returns {boolean}
 */
function ensureDevDependency(pkg, name, version) {
  if (hasDependency(pkg, name)) {
    return false
  }

  pkg.devDependencies ||= {}
  pkg.devDependencies[name] = version
  return true
}

/**
 * @param {InitProjectAction[]} actions
 * @param {string} appPath
 * @returns {void}
 */
function updatePackageJson(actions, appPath) {
  const packagePath = path.join(appPath, 'package.json')
  const packageExisted = fs.existsSync(packagePath)
  const pkg = packageExisted ? readJsonFile(packagePath) : {}
  let changed = false
  const details = []

  pkg.scripts ||= {}

  if (!pkg.scripts.test) {
    pkg.scripts.test = TEST_COMMAND
    changed = true
    details.push('added `npm test`')
  } else if (pkg.scripts.test !== TEST_COMMAND && !pkg.scripts['test:sounding']) {
    pkg.scripts['test:sounding'] = TEST_COMMAND
    changed = true
    details.push('added `npm run test:sounding`')
  }

  if (ensureDevDependency(pkg, 'sounding', SOUNDING_VERSION)) {
    changed = true
    details.push('added `sounding` devDependency')
  }

  if (ensureDevDependency(pkg, 'sails-sqlite', SQLITE_VERSION)) {
    changed = true
    details.push('added `sails-sqlite` devDependency')
  }

  if (!changed) {
    actions.push({
      type: 'skipped',
      path: packagePath,
      message: 'Kept existing package.json Sounding setup',
    })
    return
  }

  writeJsonFile(packagePath, pkg)
  actions.push({
    type: packageExisted ? 'updated' : 'created',
    path: packagePath,
    message: `${packageExisted ? 'Updated' : 'Created'} package.json (${details.join(', ')})`,
  })
}

/**
 * @param {InitProjectResult['auth']} auth
 * @returns {string}
 */
function buildFactoryTemplate(auth) {
  return `module.exports = ({ defineFactory }) =>
  defineFactory('${auth.identity}', ({ sequence }) => ({
    email: sequence('${auth.identity}-email', (next) => \`${auth.identity}-\${next}@example.com\`),
    fullName: 'Test ${auth.modelName}'
  }))
`
}

/**
 * @param {InitProjectResult['auth']} auth
 * @returns {string}
 */
function buildScenarioTemplate(auth) {
  return `module.exports = ({ defineScenario }) =>
  defineScenario('${auth.scenario}', async ({ create }) => {
    const member = await create('${auth.identity}')

    return {
      ${auth.collection}: {
        member
      }
    }
  })
`
}

/**
 * @param {InitProjectResult['auth']} auth
 * @returns {string}
 */
function buildExamplesTemplate(auth) {
  return `const { test } = require('sounding')

test('Sounding boots this Sails app', async ({ sails, expect }) => {
  expect(sails.config.environment).toBe('test')
})

test('virtual request example reaches Sails', async ({ get, expect }) => {
  const response = await get('/')

  expect(response.status).toBeDefined()
})

test('helper trial example has access to Sails helpers', async ({ sails, expect }) => {
  expect(sails.helpers).toBeDefined()
})

test.skip('authenticated request example', { world: '${auth.scenario}' }, async ({ request, world, expect }) => {
  const response = await request.as('member').get('/account')

  expect(response).toHaveStatus(200)
  expect(response).toHaveSession('${auth.identity}Id', world.current.${auth.collection}.member.id)
})

test.skip('Inertia page contract example', async ({ visit, expect }) => {
  const page = await visit('/dashboard')

  expect(page).toBeInertiaPage('dashboard/index')
  expect(page).toHaveNoInertiaErrors()
})

test.skip('captured mail example', async ({ sails, mailbox, expect }) => {
  await sails.helpers.mail.send.with({
    to: 'reader@example.com',
    subject: 'Welcome',
    template: 'welcome'
  })

  expect(mailbox).toHaveSentMail({ to: 'reader@example.com' })
})

test.skip('browser journey example', { browser: true }, async ({ page, expect }) => {
  await page.goto('/')

  await expect(page).toBeDefined()
})
`
}

/**
 * @returns {string}
 */
function buildConfigTemplate() {
  return `module.exports.sounding = {
  // Defaults are enough for most apps. Keep app-specific overrides here.
  environments: ['test']
}
`
}

/**
 * @param {InitProjectOptions} [options]
 * @returns {InitProjectResult}
 */
function initProject(options = {}) {
  const appPath = path.resolve(options.appPath || process.cwd())
  /** @type {InitProjectAction[]} */
  const actions = []
  const auth = detectAuthConvention(appPath)

  updatePackageJson(actions, appPath)

  const testsPath = path.join(appPath, 'tests')
  const factoriesPath = path.join(testsPath, 'factories')
  const scenariosPath = path.join(testsPath, 'scenarios')
  const examplesPath = path.join(testsPath, 'sounding')

  ensureDirectory(actions, appPath, testsPath)
  ensureDirectory(actions, appPath, factoriesPath)
  ensureDirectory(actions, appPath, scenariosPath)
  ensureDirectory(actions, appPath, examplesPath)

  writeFileIfMissing(
    actions,
    appPath,
    path.join(factoriesPath, `${auth.identity}.js`),
    buildFactoryTemplate(auth)
  )
  writeFileIfMissing(
    actions,
    appPath,
    path.join(scenariosPath, `${auth.scenario}.js`),
    buildScenarioTemplate(auth)
  )
  writeFileIfMissing(
    actions,
    appPath,
    path.join(examplesPath, 'examples.test.js'),
    buildExamplesTemplate(auth)
  )

  const configPath = path.join(appPath, 'config', 'sounding.js')
  if (options.config) {
    writeFileIfMissing(actions, appPath, configPath, buildConfigTemplate())
  } else {
    actions.push({
      type: 'skipped',
      path: configPath,
      message: 'Skipped config/sounding.js because Sounding defaults are enough',
    })
  }

  return {
    appPath,
    auth,
    actions,
  }
}

module.exports = {
  TEST_COMMAND,
  detectAuthConvention,
  initProject,
}
