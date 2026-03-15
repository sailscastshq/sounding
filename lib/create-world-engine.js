const {
  isFactoryDefinition,
  isScenarioDefinition,
} = require('./define-world')

function mergeValue(base, patch) {
  if (typeof patch === 'function') {
    return patch(base)
  }

  return {
    ...base,
    ...(patch || {}),
  }
}

function createFakeHelpers({ sequence }) {
  return {
    person: {
      fullName() {
        return `Test User ${sequence('fake-person')}`
      },
    },
    internet: {
      email() {
        return `user${sequence('fake-email')}@example.com`
      },
    },
    lorem: {
      words(count = 3) {
        return Array.from({ length: count }, () => `word-${sequence('fake-word')}`).join(' ')
      },
      sentence(count = 6) {
        return `${Array.from({ length: count }, () => `word-${sequence('fake-sentence')}`).join(' ')}.`
      },
    },
  }
}

function createThenableBuilder(executor, initialOverrides = {}) {
  const state = {
    overrides: initialOverrides,
    traits: [],
  }

  function run() {
    return executor(state.overrides, {
      traits: [...state.traits],
    })
  }

  const builder = {
    trait(name) {
      state.traits.push(name)
      return builder
    },

    traits(names = []) {
      state.traits.push(...names)
      return builder
    },

    with(overrides = {}) {
      state.overrides = overrides
      return builder
    },

    value() {
      return run()
    },

    then(onFulfilled, onRejected) {
      return Promise.resolve(run()).then(onFulfilled, onRejected)
    },

    catch(onRejected) {
      return Promise.resolve(run()).catch(onRejected)
    },

    finally(onFinally) {
      return Promise.resolve(run()).finally(onFinally)
    },
  }

  return builder
}

function createWorldEngine({ sails }) {
  const factories = new Map()
  const scenarios = new Map()
  const sequences = new Map()
  let currentWorld = null
  let currentSeed = null

  function sequence(nameOrBuilder = 'default', maybeBuilder) {
    const name = typeof nameOrBuilder === 'function' ? 'default' : nameOrBuilder
    const builder = typeof nameOrBuilder === 'function' ? nameOrBuilder : maybeBuilder
    const next = (sequences.get(name) || 0) + 1
    sequences.set(name, next)
    return typeof builder === 'function' ? builder(next) : next
  }

  function resolveFactory(name) {
    const entry = factories.get(name)

    if (!entry) {
      throw new Error(`Unknown Sounding factory: ${name}`)
    }

    return entry
  }

  function buildOne(name, overrides = {}, options = {}) {
    const entry = resolveFactory(name)
    const helpers = {
      fake: createFakeHelpers({ sequence }),
      sequence,
      seed: currentSeed,
      sails,
    }

    let value =
      typeof entry.definition === 'function'
        ? entry.definition(helpers)
        : { ...entry.definition }

    for (const traitName of options.traits || []) {
      if (!entry.traits.has(traitName)) {
        throw new Error(`Unknown Sounding trait \`${traitName}\` for factory \`${name}\``)
      }

      value = mergeValue(value, entry.traits.get(traitName))
    }

    return {
      ...value,
      ...overrides,
    }
  }

  async function createOne(name, overrides = {}, options = {}) {
    const value = buildOne(name, overrides, options)
    const model = sails?.models?.[name]

    if (model?.create) {
      const query = model.create(value)
      return typeof query.fetch === 'function' ? query.fetch() : query
    }

    return value
  }

  function registerFactoryDefinition(entry) {
    const nextEntry = {
      definition: entry.definition,
      traits: new Map(entry.traits || []),
    }

    factories.set(entry.name, nextEntry)

    return {
      trait(traitName, patch) {
        nextEntry.traits.set(traitName, patch)
        return this
      },
    }
  }

  function registerScenarioDefinition(entry) {
    scenarios.set(entry.name, entry.definition)
    return entry
  }

  function defineFactory(nameOrEntry, definition) {
    if (isFactoryDefinition(nameOrEntry)) {
      return registerFactoryDefinition(nameOrEntry)
    }

    const entry = {
      name: nameOrEntry,
      definition,
      traits: [],
    }

    return registerFactoryDefinition(entry)
  }

  function defineScenario(nameOrEntry, definition) {
    if (isScenarioDefinition(nameOrEntry)) {
      return registerScenarioDefinition(nameOrEntry)
    }

    return registerScenarioDefinition({
      name: nameOrEntry,
      definition,
    })
  }

  async function use(name, context = {}) {
    const definition = scenarios.get(name)

    if (!definition) {
      throw new Error(`Unknown Sounding scenario: ${name}`)
    }

    currentWorld = await definition({
      build(name, overrides = {}) {
        return createThenableBuilder(
          (nextOverrides, options) => buildOne(name, nextOverrides, options),
          overrides
        )
      },
      create(name, overrides = {}) {
        return createThenableBuilder(
          (nextOverrides, options) => createOne(name, nextOverrides, options),
          overrides
        )
      },
      defineFactory,
      defineScenario,
      sails,
      sequence,
      seed: currentSeed,
      context,
    })

    return currentWorld
  }

  return {
    build(name, overrides = {}, options = {}) {
      return buildOne(name, overrides, options)
    },

    async buildMany(name, count, overrides = {}, options = {}) {
      return Array.from({ length: count }, () => buildOne(name, overrides, options))
    },

    create(name, overrides = {}, options = {}) {
      return createOne(name, overrides, options)
    },

    async createMany(name, count, overrides = {}, options = {}) {
      const records = []
      for (let index = 0; index < count; index += 1) {
        records.push(await createOne(name, overrides, options))
      }
      return records
    },

    defineFactory,
    defineScenario,

    register(definition) {
      if (isFactoryDefinition(definition)) {
        return defineFactory(definition)
      }

      if (isScenarioDefinition(definition)) {
        return defineScenario(definition)
      }

      throw new Error('Sounding could not register an unknown world definition.')
    },

    get current() {
      return currentWorld
    },

    get factories() {
      return Array.from(factories.keys())
    },

    get scenarios() {
      return Array.from(scenarios.keys())
    },

    reset(options = {}) {
      const { preserveSequences = false } = options

      factories.clear()
      scenarios.clear()
      if (!preserveSequences) {
        sequences.clear()
      }
      currentWorld = null
      currentSeed = null
    },

    seed(value) {
      currentSeed = value
      return currentSeed
    },

    sequence,
    use,
  }
}

module.exports = { createWorldEngine }
