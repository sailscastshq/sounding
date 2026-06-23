const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_SNAPSHOT_DIR = 'tests/screenshots'
const DEFAULT_VISUAL_ARTIFACT_DIR = '.tmp/sounding/artifacts/visual'

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizePathSegment(value) {
  return String(value || '')
    .trim()
    .replace(/\.png$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function escapeHtml(filePath) {
  return String(filePath)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {Buffer} value
 * @returns {string}
 */
function hashBuffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/**
 * @param {string} value
 * @param {string} fallback
 * @returns {string}
 */
function resolveConfiguredPath(value, fallback) {
  const configured = value || fallback
  return path.resolve(process.cwd(), configured)
}

/**
 * @returns {boolean}
 */
function shouldUpdateSnapshots() {
  return (
    process.env.SOUNDING_UPDATE_SNAPSHOTS === '1' ||
    process.env.SOUNDING_UPDATE_SNAPSHOTS === 'true'
  )
}

/**
 * @param {string} snapshotName
 * @param {string} project
 * @returns {{
 *   name: string,
 *   project: string,
 *   baselinePath: string,
 *   artifactDirectory: string,
 *   actualPath: string,
 *   expectedPath: string,
 *   diffPath: string,
 * }}
 */
function resolveVisualSnapshotPaths(snapshotName, project = 'desktop') {
  const safeName = sanitizePathSegment(snapshotName)
  const safeProject = sanitizePathSegment(project) || 'desktop'

  if (!safeName) {
    throw new TypeError('Sounding visual snapshots require a non-empty screenshot name.')
  }

  const baselineDirectory = path.join(
    resolveConfiguredPath(process.env.SOUNDING_SNAPSHOT_DIR, DEFAULT_SNAPSHOT_DIR),
    safeProject
  )
  const artifactDirectory = path.join(
    resolveConfiguredPath(process.env.SOUNDING_VISUAL_ARTIFACT_DIR, DEFAULT_VISUAL_ARTIFACT_DIR),
    safeProject,
    safeName
  )

  return {
    name: safeName,
    project: safeProject,
    baselinePath: path.join(baselineDirectory, `${safeName}.png`),
    artifactDirectory,
    actualPath: path.join(artifactDirectory, 'actual.png'),
    expectedPath: path.join(artifactDirectory, 'expected.png'),
    diffPath: path.join(artifactDirectory, 'diff.html'),
  }
}

/**
 * @param {string} expectedPath
 * @param {string} actualPath
 * @returns {string}
 */
function createVisualDiffHtml(expectedPath, actualPath) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Sounding visual diff</title>',
    '<style>',
    'body{font-family:ui-sans-serif,system-ui,sans-serif;margin:24px;background:#111;color:#f7f7f2;}',
    'main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;}',
    'figure{margin:0;border:1px solid #333;background:#181818;padding:12px;}',
    'img{display:block;width:100%;height:auto;background:white;}',
    'figcaption{margin-bottom:10px;color:#aaa;font-size:14px;}',
    '</style>',
    '</head>',
    '<body>',
    '<h1>Sounding visual diff</h1>',
    '<main>',
    `<figure><figcaption>Expected</figcaption><img src="${escapeHtml(path.basename(expectedPath))}" alt="Expected screenshot"></figure>`,
    `<figure><figcaption>Actual</figcaption><img src="${escapeHtml(path.basename(actualPath))}" alt="Actual screenshot"></figure>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/**
 * @param {Buffer} expected
 * @param {Buffer} actual
 * @param {ReturnType<typeof resolveVisualSnapshotPaths>} paths
 * @returns {Promise<void>}
 */
async function writeVisualDiffArtifacts(expected, actual, paths) {
  await fs.promises.mkdir(paths.artifactDirectory, { recursive: true })
  await fs.promises.writeFile(paths.expectedPath, expected)
  await fs.promises.writeFile(paths.actualPath, actual)
  await fs.promises.writeFile(paths.diffPath, createVisualDiffHtml(paths.expectedPath, paths.actualPath))
}

/**
 * @param {any} page
 * @param {string} snapshotName
 * @param {{ project?: string, screenshotOptions?: Record<string, any> }} options
 * @returns {Promise<{ status: 'matched' | 'updated', paths: ReturnType<typeof resolveVisualSnapshotPaths> }>}
 */
async function matchVisualSnapshot(page, snapshotName, options = {}) {
  if (typeof page?.screenshot !== 'function') {
    throw new TypeError('Sounding visual snapshots require a browser page with screenshot().')
  }

  const paths = resolveVisualSnapshotPaths(snapshotName, options.project)
  const { path: _path, ...screenshotOptions } = options.screenshotOptions || {}
  const actual = await page.screenshot({
    fullPage: true,
    ...screenshotOptions,
  })

  if (!Buffer.isBuffer(actual)) {
    throw new TypeError('Sounding visual snapshots require page.screenshot() to return a Buffer.')
  }

  if (shouldUpdateSnapshots()) {
    await fs.promises.mkdir(path.dirname(paths.baselinePath), { recursive: true })
    await fs.promises.writeFile(paths.baselinePath, actual)
    return {
      status: 'updated',
      paths,
    }
  }

  let expected
  try {
    expected = await fs.promises.readFile(paths.baselinePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const missing = /** @type {Error & { code?: string, paths?: any }} */ (
        new Error(
          [
            `Missing visual baseline for ${JSON.stringify(snapshotName)}.`,
            '',
            'Run with `SOUNDING_UPDATE_SNAPSHOTS=1 npx sounding test` or `npx sounding test --update-snapshots` to create it.',
            `Baseline: ${paths.baselinePath}`,
          ].join('\n')
        )
      )
      missing.code = 'E_SOUNDING_VISUAL_SNAPSHOT_MISSING'
      missing.paths = paths
      throw missing
    }

    throw error
  }

  if (!expected.equals(actual)) {
    await writeVisualDiffArtifacts(expected, actual, paths)

    const mismatch = /** @type {Error & { code?: string, paths?: any }} */ (
      new Error(
        [
          `Visual snapshot ${JSON.stringify(snapshotName)} did not match.`,
          '',
          `Baseline: ${paths.baselinePath}`,
          `Expected: ${paths.expectedPath}`,
          `Actual: ${paths.actualPath}`,
          `Diff: ${paths.diffPath}`,
          `Expected SHA-256: ${hashBuffer(expected)}`,
          `Actual SHA-256: ${hashBuffer(actual)}`,
        ].join('\n')
      )
    )
    mismatch.code = 'E_SOUNDING_VISUAL_SNAPSHOT_MISMATCH'
    mismatch.paths = paths
    throw mismatch
  }

  return {
    status: 'matched',
    paths,
  }
}

module.exports = {
  DEFAULT_SNAPSHOT_DIR,
  DEFAULT_VISUAL_ARTIFACT_DIR,
  matchVisualSnapshot,
  resolveVisualSnapshotPaths,
  shouldUpdateSnapshots,
}
