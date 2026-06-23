/**
 * @param {any} value
 * @returns {number}
 */
function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * @param {any} source
 * @param {string[]} keys
 * @returns {number}
 */
function pickNumber(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined) {
      return toNumber(source[key])
    }
  }

  return 0
}

/**
 * @param {Record<string, any>} source
 * @returns {{
 *   min(): number,
 *   med(): number,
 *   median(): number,
 *   mean(): number,
 *   average(): number,
 *   max(): number,
 *   p90(): number,
 *   p95(): number,
 *   p99(): number,
 * }}
 */
function createDurationMetric(source = {}) {
  return {
    min: () => pickNumber(source, ['min', 'minimum']),
    med: () => pickNumber(source, ['p50', 'median', 'med']),
    median: () => pickNumber(source, ['p50', 'median', 'med']),
    mean: () => pickNumber(source, ['average', 'mean']),
    average: () => pickNumber(source, ['average', 'mean']),
    max: () => pickNumber(source, ['max', 'maximum']),
    p90: () => pickNumber(source, ['p90']),
    p95: () => pickNumber(source, ['p95', 'p97_5', 'p97.5']),
    p99: () => pickNumber(source, ['p99']),
  }
}

/**
 * @param {{ count?: number, rate?: number }} input
 */
function createDataMetric(input = {}) {
  return {
    count: () => toNumber(input.count),
    rate: () => toNumber(input.rate),
  }
}

/**
 * @param {{
 *   raw: any,
 *   options: {
 *     concurrency: number,
 *     duration: number,
 *     method: string,
 *     target: string,
 *     url: string,
 *   },
 * }} input
 */
function createStressResult({ raw, options }) {
  const duration = toNumber(raw?.duration || options.duration)
  const requestCount = pickNumber(raw?.requests, ['total', 'sent', 'count'])
  const requestRate =
    pickNumber(raw?.requests, ['average', 'mean', 'rate']) ||
    (duration > 0 ? requestCount / duration : 0)
  const failedCount =
    toNumber(raw?.errors) + toNumber(raw?.timeouts) + toNumber(raw?.non2xx) + toNumber(raw?.mismatches)
  const failedRate = duration > 0 ? failedCount / duration : 0
  const downloadBytes = pickNumber(raw?.throughput, ['total', 'count'])
  const downloadRate = pickNumber(raw?.throughput, ['average', 'mean', 'rate'])
  const uploadBytes = toNumber(raw?.bodyBytes || raw?.uploadBytes)
  const uploadRate = duration > 0 ? uploadBytes / duration : 0

  return {
    raw,
    target: options.target,
    url: options.url,
    method: options.method,
    requests: {
      count: () => requestCount,
      rate: () => requestRate,
      duration: () => createDurationMetric(raw?.latency || {}),
      ttfb: () => ({
        duration: () => createDurationMetric(raw?.ttfb || {}),
      }),
      failed: () => ({
        count: () => failedCount,
        rate: () => failedRate,
      }),
      download: () => ({
        duration: () => createDurationMetric(raw?.download || {}),
        data: () =>
          createDataMetric({
            count: downloadBytes,
            rate: downloadRate,
          }),
      }),
      upload: () => ({
        duration: () => createDurationMetric(raw?.upload || {}),
        data: () =>
          createDataMetric({
            count: uploadBytes,
            rate: uploadRate,
          }),
      }),
    },
    testRun: {
      concurrency: () => toNumber(raw?.connections || options.concurrency),
      duration: () => duration,
    },
    toJSON() {
      return {
        target: options.target,
        url: options.url,
        method: options.method,
        requests: {
          count: requestCount,
          rate: requestRate,
          failed: {
            count: failedCount,
            rate: failedRate,
          },
          duration: {
            min: this.requests.duration().min(),
            med: this.requests.duration().med(),
            max: this.requests.duration().max(),
            p90: this.requests.duration().p90(),
            p95: this.requests.duration().p95(),
          },
          download: {
            bytes: downloadBytes,
            rate: downloadRate,
          },
          upload: {
            bytes: uploadBytes,
            rate: uploadRate,
          },
        },
        testRun: {
          concurrency: this.testRun.concurrency(),
          duration: this.testRun.duration(),
        },
      }
    },
  }
}

/**
 * @param {number} value
 * @param {string} unit
 * @returns {string}
 */
function formatNumber(value, unit = '') {
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(2)
  return `${normalized}${unit}`
}

/**
 * @param {ReturnType<typeof createStressResult>} result
 * @returns {string}
 */
function formatStressResult(result) {
  const requests = result.requests
  const duration = requests.duration()
  const failed = requests.failed()

  return [
    `STRESS ${result.method} ${result.url}`,
    `Requests: ${formatNumber(requests.count())} total, ${formatNumber(requests.rate())}/s, ${formatNumber(failed.count())} failed`,
    `Latency: med ${formatNumber(duration.med(), 'ms')}, p95 ${formatNumber(duration.p95(), 'ms')}, max ${formatNumber(duration.max(), 'ms')}`,
    `Run: ${formatNumber(result.testRun.duration(), 's')}, concurrency ${formatNumber(result.testRun.concurrency())}`,
  ].join('\n')
}

module.exports = {
  createStressResult,
  formatStressResult,
}
