const DEFAULT_HEADERS = {
  'x-inertia': 'true',
  'x-requested-with': 'XMLHttpRequest',
  accept: 'text/html, application/xhtml+xml',
}

function joinHeaderValue(value) {
  return Array.isArray(value) ? value.join(',') : value
}

function buildVisitHeaders(options = {}) {
  const headers = {
    ...(options.headers || {}),
  }

  if (options.version) {
    headers['x-inertia-version'] = options.version
  }

  if (options.errorBag) {
    headers['x-inertia-error-bag'] = options.errorBag
  }

  if (options.only?.length) {
    if (!options.component) {
      throw new Error('Sounding visit() requires `component` when using `only`.')
    }

    headers['x-inertia-partial-component'] = options.component
    headers['x-inertia-partial-data'] = joinHeaderValue(options.only)
  }

  if (options.except?.length) {
    if (!options.component) {
      throw new Error('Sounding visit() requires `component` when using `except`.')
    }

    headers['x-inertia-partial-component'] = options.component
    headers['x-inertia-partial-except'] = joinHeaderValue(options.except)
  }

  if (options.reset?.length) {
    headers['x-inertia-reset'] = joinHeaderValue(options.reset)
  }

  return headers
}

function buildRequestOptions(options = {}) {
  const {
    component,
    only,
    except,
    reset,
    errorBag,
    version,
    ...requestOptions
  } = options

  const visitHeaders = buildVisitHeaders({
    component,
    only,
    except,
    reset,
    errorBag,
    version,
    headers: requestOptions.headers,
  })

  const output = {
    ...requestOptions,
  }

  if (Object.keys(visitHeaders).length > 0) {
    output.headers = visitHeaders
  }

  return output
}

function createVisitClient({ request }) {
  const client = request.withHeaders(DEFAULT_HEADERS)

  function visit(target, options = {}) {
    return client.get(target, buildRequestOptions(options))
  }

  visit.get = (target, options = {}) => client.get(target, buildRequestOptions(options))
  visit.head = (target, options = {}) => client.head(target, buildRequestOptions(options))
  visit.post = (target, payload, options = {}) => client.post(target, payload, buildRequestOptions(options))
  visit.put = (target, payload, options = {}) => client.put(target, payload, buildRequestOptions(options))
  visit.patch = (target, payload, options = {}) =>
    client.patch(target, payload, buildRequestOptions(options))
  visit.delete = (target, payload, options = {}) =>
    client.delete(target, payload, buildRequestOptions(options))
  visit.del = visit.delete
  visit.using = (transport) => createVisitClient({ request: request.using(transport) })

  Object.defineProperty(visit, 'transport', {
    enumerable: true,
    get() {
      return client.transport
    },
  })

  return visit
}

module.exports = {
  createVisitClient,
  DEFAULT_HEADERS,
  buildVisitHeaders,
  buildRequestOptions,
}
