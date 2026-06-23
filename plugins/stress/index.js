const { createStressClient } = require('./lib/create-stress-client')
const { runStressCommand } = require('./lib/command')
const { createStressResult, formatStressResult } = require('./lib/result')

module.exports = function stressPlugin(api) {
  return {
    name: 'stress',

    commands: {
      stress(argv, context) {
        return runStressCommand(argv, {
          ...context,
          api,
        })
      },
    },

    testMethods: {
      stress: {
        mode: 'stress',
        options: {
          transport: 'http',
        },
      },
    },

    trial({ sails, config, world, appPath, events }) {
      return {
        stress: createStressClient({
          api,
          sails,
          getConfig: () => config,
          world,
          appPath,
          events,
        }),
      }
    },
  }
}

module.exports.createStressClient = createStressClient
module.exports.createStressResult = createStressResult
module.exports.formatStressResult = formatStressResult
