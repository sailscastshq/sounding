function defineFactory(name, definition) {
  const entry = {
    __soundingType: 'factory',
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

function defineScenario(name, definition) {
  return {
    __soundingType: 'scenario',
    name,
    definition,
  }
}

function isFactoryDefinition(value) {
  return value?.__soundingType === 'factory'
}

function isScenarioDefinition(value) {
  return value?.__soundingType === 'scenario'
}

module.exports = {
  defineFactory,
  defineScenario,
  isFactoryDefinition,
  isScenarioDefinition,
}
