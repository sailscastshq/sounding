const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createSoundingBrowserPage } = require('../lib/create-browser-page')
const { createExpect } = require('../lib/create-expect')
const { resolveVisualSnapshotPaths } = require('../lib/visual-snapshots')

function createTempVisualEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-visual-'))
  const previous = {
    SOUNDING_SNAPSHOT_DIR: process.env.SOUNDING_SNAPSHOT_DIR,
    SOUNDING_VISUAL_ARTIFACT_DIR: process.env.SOUNDING_VISUAL_ARTIFACT_DIR,
    SOUNDING_UPDATE_SNAPSHOTS: process.env.SOUNDING_UPDATE_SNAPSHOTS,
  }

  process.env.SOUNDING_SNAPSHOT_DIR = path.join(root, 'snapshots')
  process.env.SOUNDING_VISUAL_ARTIFACT_DIR = path.join(root, 'artifacts')
  delete process.env.SOUNDING_UPDATE_SNAPSHOTS

  return {
    root,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }

      fs.rmSync(root, { recursive: true, force: true })
    },
  }
}

function createPage(buffer, options = {}) {
  const calls = []
  const rawPage = {
    async screenshot(screenshotOptions) {
      calls.push(['screenshot', screenshotOptions])
      return Buffer.from(buffer)
    },
    url: () => 'http://127.0.0.1:3333/pricing',
  }

  return {
    calls,
    page: createSoundingBrowserPage(rawPage, {
      project: options.project || 'desktop',
    }),
  }
}

test('toMatchScreenshot creates baselines in update mode', async () => {
  const env = createTempVisualEnv()

  try {
    process.env.SOUNDING_UPDATE_SNAPSHOTS = '1'
    const { page, calls } = createPage('approved screenshot', { project: 'mobile' })

    await createExpect(page).toMatchScreenshot('pricing page')

    const paths = resolveVisualSnapshotPaths('pricing page', 'mobile')
    assert.equal(fs.readFileSync(paths.baselinePath).toString(), 'approved screenshot')
    assert.deepEqual(calls, [['screenshot', { fullPage: true }]])
  } finally {
    env.restore()
  }
})

test('toMatchScreenshot passes when the baseline matches', async () => {
  const env = createTempVisualEnv()

  try {
    const paths = resolveVisualSnapshotPaths('pricing', 'desktop')
    fs.mkdirSync(path.dirname(paths.baselinePath), { recursive: true })
    fs.writeFileSync(paths.baselinePath, 'same screenshot')

    const { page } = createPage('same screenshot')

    await createExpect(page).toMatchScreenshot('pricing')
  } finally {
    env.restore()
  }
})

test('toMatchScreenshot explains missing baselines', async () => {
  const env = createTempVisualEnv()

  try {
    const { page } = createPage('new screenshot')

    await assert.rejects(
      async () => {
        await createExpect(page).toMatchScreenshot('pricing')
      },
      (error) => {
        assert.match(error.message, /Missing visual baseline/)
        assert.match(error.message, /SOUNDING_UPDATE_SNAPSHOTS=1 npx sounding test/)
        assert.match(error.message, /--update-snapshots/)
        assert.match(error.message, /tests\/screenshots|snapshots/)
        return true
      }
    )
  } finally {
    env.restore()
  }
})

test('toMatchScreenshot writes mismatch artifacts', async () => {
  const env = createTempVisualEnv()

  try {
    const paths = resolveVisualSnapshotPaths('pricing', 'desktop')
    fs.mkdirSync(path.dirname(paths.baselinePath), { recursive: true })
    fs.writeFileSync(paths.baselinePath, 'expected screenshot')

    const { page } = createPage('actual screenshot')

    await assert.rejects(
      async () => {
        await createExpect(page).toMatchScreenshot('pricing', { animations: 'disabled' })
      },
      (error) => {
        assert.match(error.message, /Visual snapshot "pricing" did not match/)
        assert.match(error.message, /actual\.png/)
        assert.match(error.message, /expected\.png/)
        assert.match(error.message, /diff\.html/)
        return true
      }
    )

    assert.equal(fs.readFileSync(paths.actualPath).toString(), 'actual screenshot')
    assert.equal(fs.readFileSync(paths.expectedPath).toString(), 'expected screenshot')
    assert.match(fs.readFileSync(paths.diffPath, 'utf8'), /Sounding visual diff/)
  } finally {
    env.restore()
  }
})
