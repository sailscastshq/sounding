/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingUserConfig} SoundingUserConfig */

/**
 * @param {any} value
 * @returns {value is AnyRecord}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {any} datastore
 * @returns {any}
 */
function normalizeDatastore(datastore) {
  if (typeof datastore === 'string') {
    return {
      mode: datastore,
    }
  }

  if (!isPlainObject(datastore)) {
    return datastore
  }

  return { ...datastore }
}

/**
 * @param {any} [config]
 * @returns {SoundingUserConfig}
 */
function normalizeUserConfig(config = {}) {
  if (!isPlainObject(config)) {
    return {}
  }

  const normalized = { ...config }

  if ('datastore' in normalized) {
    normalized.datastore = normalizeDatastore(normalized.datastore)
  }

  return normalized
}

module.exports = {
  normalizeDatastore,
  normalizeUserConfig,
}
