#!/usr/bin/env node

const { initProject } = require('../lib/init-project')
const { formatTestCommand, runTests } = require('../lib/test-runner')

function printHelp() {
  process.stdout.write(`Sounding

Usage:
  sounding init [--app <path>] [--config]
  sounding test [options] [files or folders]

Commands:
  init      Scaffold Sounding tests, worlds, and package scripts in a Sails app.
  test      Run Sounding trials through the Node.js test runner.

Options:
  --app     Target app directory. Defaults to the current working directory.
  --config  Also create config/sounding.js when it does not already exist.
  --help    Show this help.
`)
}

function printTestHelp() {
  process.stdout.write(`Sounding test

Usage:
  sounding test [options] [files or folders]

Options:
  --app <path>                   Target app directory.
  --grep <pattern>               Forward to --test-name-pattern.
  --file <path>                  Run one file. May be repeated.
  --lane <name>                  Run tests under tests/<name> or test/<name>.
  --changed                      Run changed .test.js files when git metadata is available.
  --shard <part/total>           Run one shard, for example --shard=1/4.
  --parallel                     Run test files with Node test concurrency enabled.
  --watch                        Forward to Node watch mode.
  --reporter <name>              Use a Node reporter, or "sounding" for Sounding output.
  --reporter-destination <path>  Forward to --test-reporter-destination.
  --compact                      Keep Sounding reporter output failure-focused.
  --profile                      Print the slowest trials before the final summary.
  --slow <count>                 Control how many profiled trials are shown. Implies --profile.
  --verbose                      Show full stacks and verbose Sounding diagnostics.
  --raw-error                    Show raw Node/Sounding error details after formatted failures.
  --update-snapshots             Create or overwrite visual screenshot baselines.
  --junit [path]                 Use the junit reporter.
  --json                         Use the json reporter.
  --coverage                     Enable Node test coverage.
  --dry-run                      Print the Node command without running it.

Unknown --test-* and Node flags pass through to node.
`)
}

function parseArgs(argv) {
  const args = [...argv]
  const options = {}
  const command = args.shift()

  if (command === '--help' || command === '-h') {
    return {
      command: null,
      options: {
        help: true,
      },
    }
  }

  if (command === 'test') {
    return {
      command,
      options: {
        argv: args,
      },
    }
  }

  while (args.length > 0) {
    const arg = args.shift()

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--config') {
      options.config = true
      continue
    }

    if (arg === '--app') {
      options.appPath = args.shift()
      if (!options.appPath) {
        throw new Error('Sounding option `--app` requires a path.')
      }
      continue
    }

    throw new Error(`Unknown Sounding option: ${arg}`)
  }

  return {
    command,
    options,
  }
}

function printInitResult(result) {
  process.stdout.write(`Sounding initialized ${result.appPath}\n`)
  process.stdout.write(
    `Auth convention: ${result.auth.modelName}${result.auth.detected ? '' : ' (default)'}\n`
  )

  for (const action of result.actions) {
    const marker = action.type === 'created' ? '+' : action.type === 'updated' ? '~' : '-'
    process.stdout.write(`${marker} ${action.message}\n`)
  }

  process.stdout.write('\nNext: run npm install, then npm test.\n')
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2))

  if (!command || options.help) {
    printHelp()
    return
  }

  if (command === 'init') {
    const result = initProject(options)
    printInitResult(result)
    return
  }

  if (command === 'test') {
    if (options.argv.includes('--help') || options.argv.includes('-h')) {
      printTestHelp()
      return
    }

    const result = await runTests({
      argv: options.argv,
      stdio: 'inherit',
    })

    if (result.command.dryRun) {
      process.stdout.write(`${formatTestCommand(result.command)}\n`)
    }

    process.exitCode = result.status
    return
  }

  {
    throw new Error(`Unknown Sounding command: ${command}`)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
