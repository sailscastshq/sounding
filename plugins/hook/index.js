const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

module.exports = function hookPlugin(api) {
  const { mergeConfig } = api
  const fail = (code, message) =>
    api.createSoundingError({ code, name: 'SoundingHookFixtureError', message })
  return {
    name: 'hook',
    trialOptions: ['hook'],
    async prepareApp({ options = {}, projectPath }) {
      const packageFile = path.join(projectPath, 'package.json')
      const pkg = fs.existsSync(packageFile) ? JSON.parse(fs.readFileSync(packageFile, 'utf8')) : {}
      // Sounding's own hook is not an implicit dogfood target for every core trial.
      if (!options.hook && (!pkg.sails?.isHook || pkg.name === 'sounding')) return null
      if (options.concurrent)
        throw fail(
          'E_SOUNDING_HOOK_CONCURRENCY',
          'Hook fixtures run serially; use separate test processes for concurrent hook lifecycle tests.'
        )
      const configPath = path.join(projectPath, 'config/sounding.js')
      let projectConfig = {}
      if (fs.existsSync(configPath)) {
        delete require.cache[require.resolve(configPath)]
        projectConfig = require(configPath).sounding || {}
      }
      if (
        options.hook !== undefined &&
        (!options.hook || typeof options.hook !== 'object' || Array.isArray(options.hook))
      ) {
        throw fail('E_SOUNDING_HOOK_OPTIONS_INVALID', 'hook must be a fixture options object.')
      }
      const settings = mergeConfig(projectConfig.hook || {}, options.hook || {})
      for (const key of ['config', 'files']) {
        if (
          settings[key] !== undefined &&
          (!settings[key] || typeof settings[key] !== 'object' || Array.isArray(settings[key]))
        ) {
          throw fail('E_SOUNDING_HOOK_OPTIONS_INVALID', `hook.${key} must be an object.`)
        }
      }
      const allowed = ['name', 'module', 'config', 'files', 'app', 'loadHooks', 'appPath', 'mount']
      for (const key of Object.keys(settings)) {
        if (!allowed.includes(key))
          throw fail('E_SOUNDING_HOOK_OPTION_UNKNOWN', `Unsupported hook fixture option: ${key}.`)
      }
      if (settings.mount && settings.mount !== 'direct')
        throw fail(
          'E_SOUNDING_HOOK_MOUNT_UNSUPPORTED',
          'This local MVP supports only direct hook mounts.'
        )
      if (settings.app && !['load', 'lift'].includes(settings.app))
        throw fail('E_SOUNDING_HOOK_APP_INVALID', 'hook.app must be load or lift.')
      const name =
        settings.name ||
        settings.config?.installedHooks?.[pkg.name]?.name ||
        pkg.sails?.hookName ||
        (pkg.name || '').replace(/^@[^/]+\//, '').replace(/^sails-hook-/, '')
      if (
        typeof name !== 'string' ||
        !name ||
        name === 'sounding' ||
        !/^[a-z][a-z0-9-]*$/i.test(name)
      ) {
        throw fail(
          'E_SOUNDING_HOOK_NAME_INVALID',
          'Set hook.name or provide valid package sails.hookName metadata.'
        )
      }
      const hookFactory =
        typeof settings.module === 'function'
          ? settings.module
          : require(settings.module ? path.resolve(projectPath, settings.module) : projectPath)
      if (typeof hookFactory !== 'function')
        throw fail(
          'E_SOUNDING_HOOK_MODULE_INVALID',
          'The hook module must export a Sails hook factory.'
        )
      const SailsConstructor = api.loadDependencyFromApp({
        appPath: projectPath,
        moduleId: 'sails',
        purpose: 'test a real hook',
        install: 'npm install -D sails',
      }).Sails
      const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-hook-'))
      let manager
      let app
      const cleanup = async () => {
        try {
          if (manager) await manager.lower()
        } finally {
          fs.rmSync(appPath, { recursive: true, force: true })
        }
      }
      try {
        if (settings.appPath) {
          fs.cpSync(path.resolve(projectPath, settings.appPath), appPath, {
            recursive: true,
            filter(source) {
              if (['node_modules', '.git', '.tmp'].includes(path.basename(source))) return false
              if (fs.lstatSync(source).isSymbolicLink())
                throw fail(
                  'E_SOUNDING_HOOK_FIXTURE_SYMLINK',
                  'Fixture source symlinks are unsupported in this MVP.'
                )
              return true
            },
          })
        }
        for (const [relative, content] of Object.entries(settings.files || {})) {
          const target = path.resolve(appPath, relative)
          if (
            path.isAbsolute(relative) ||
            !target.startsWith(`${appPath}${path.sep}`) ||
            ['node_modules', '.git'].includes(relative.split(/[\\/]/)[0])
          ) {
            throw fail(
              'E_SOUNDING_HOOK_FIXTURE_PATH',
              `Fixture file must stay inside the generated app: ${relative}.`
            )
          }
          if (typeof content !== 'string')
            throw fail(
              'E_SOUNDING_HOOK_FIXTURE_CONTENT',
              `Fixture file content must be a string: ${relative}.`
            )
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.writeFileSync(target, content)
        }
        fs.mkdirSync(path.join(appPath, 'config'), { recursive: true })
        fs.writeFileSync(
          path.join(appPath, 'package.json'),
          JSON.stringify({ name: 'sounding-hook-fixture', private: true })
        )
        // Root config belongs to the package; hook instructions do not enter core validation.
        fs.writeFileSync(
          path.join(appPath, 'config/sounding.js'),
          fs.existsSync(configPath)
            ? `const {hook,...core}=require(${JSON.stringify(configPath)}).sounding||{};module.exports.sounding={...core,datastore:core.datastore||'inherit',app:{...core.app,quiet:false}}`
            : "module.exports.sounding={datastore:'inherit',app:{quiet:false}}"
        )
        const nodeModules = path.join(projectPath, 'node_modules')
        if (fs.existsSync(nodeModules))
          fs.symlinkSync(nodeModules, path.join(appPath, 'node_modules'), 'dir')
        const needsHttp =
          options.transport === 'http' ||
          options.browser ||
          options.socket ||
          settings.app === 'lift'
        const loadHooks = settings.loadHooks || [
          'moduleloader',
          'userconfig',
          'helpers',
          name,
          'sounding',
        ]
        if (!Array.isArray(loadHooks) || loadHooks.some((key) => typeof key !== 'string'))
          throw fail('E_SOUNDING_HOOK_LOAD_HOOKS', 'hook.loadHooks must be an array of hook names.')
        const selectedHooks = [
          ...new Set([
            ...loadHooks,
            'moduleloader',
            'userconfig',
            name,
            'sounding',
            ...(needsHttp ? ['http', 'request', 'responses'] : []),
          ]),
        ]
        const config = mergeConfig(
          {
            globals: false,
            log: { level: 'silent' },
            host: '127.0.0.1',
            port: 0,
            datastores: { default: { adapter: 'unused', url: 'unused' } },
            hooks: { session: false, grunt: false },
          },
          settings.config || {}
        )
        config.hooks = { ...config.hooks, [name]: hookFactory, sounding: api.soundingHook }
        config.loadHooks = selectedHooks
        // Fixture path/lifecycle cannot be redirected by hook config.
        config.appPath = appPath
        config.environment = 'test'
        manager = api.createAppManager({
          appPath,
          SailsConstructor,
          loadOptions: config,
          liftOptions: config,
        })
        const hookApp = {
          name,
          packageName: pkg.name,
          packageRoot: projectPath,
          appPath,
          mount: 'direct',
        }
        return {
          runtime: async () => {
            app = needsHttp ? await manager.lift() : await manager.load()
            const hook = app.hooks[name]
            if (!hook) throw fail('E_SOUNDING_HOOK_MISSING', `Sails did not load hook ${name}.`)
            if (Object.prototype.hasOwnProperty.call(hook, 'name') && hook.name !== hook.identity) {
              throw fail(
                'E_SOUNDING_HOOK_NAME_CONFLICT',
                'The hook name must match its Sails identity.'
              )
            }
            if (!Object.prototype.hasOwnProperty.call(hook, 'name'))
              Object.defineProperty(hook, 'name', { value: hook.identity, enumerable: true })
            return app.sounding
          },
          context: {
            get hook() {
              return app.hooks[name]
            },
            hookApp,
          },
          cleanup,
        }
      } catch (error) {
        try {
          await cleanup()
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'Fixture setup and cleanup failed.')
        }
        throw error
      }
    },
  }
}
