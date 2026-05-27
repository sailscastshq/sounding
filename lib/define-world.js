/** @typedef {import('./types').SoundingFactoryDefinition} SoundingFactoryDefinition */
/** @typedef {import('./types').SoundingScenarioDefinition} SoundingScenarioDefinition */

/**
 * Define a reusable record factory for Sounding worlds.
 *
 * @param {string} name
 * @param {SoundingFactoryDefinition['definition']} definition
 * @returns {SoundingFactoryDefinition}
 */
function defineFactory(name, definition) {
  const entry = {
    __soundingType: /** @type {'factory'} */ ('factory'),
    name,
    definition,
    traits: [],
    trait(traitName, patch) {
      entry.traits.push([traitName, patch])
      return entry
    },
  }

  return entry
}

/**
 * Define a named scenario that can seed a trial with product-language data.
 *
 * @param {string} name
 * @param {SoundingScenarioDefinition['definition']} definition
 * @returns {SoundingScenarioDefinition}
 */
function defineScenario(name, definition) {
  return {
    __soundingType: /** @type {'scenario'} */ ('scenario'),
    name,
    definition,
  }
}

/**
 * @param {any} value
 * @returns {value is SoundingFactoryDefinition}
 */
function isFactoryDefinition(value) {
  return value?.__soundingType === 'factory'
}

/**
 * @param {any} value
 * @returns {value is SoundingScenarioDefinition}
 */
function isScenarioDefinition(value) {
  return value?.__soundingType === 'scenario'
}

module.exports = {
  defineFactory,
  defineScenario,
  isFactoryDefinition,
  isScenarioDefinition,
}
