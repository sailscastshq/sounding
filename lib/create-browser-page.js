const assert = require('node:assert/strict')

const SOUNDING_BROWSER_PAGE = Symbol.for('sounding.browserPage')
const SOUNDING_BROWSER_PAGE_COLLECTION = Symbol.for('sounding.browserPageCollection')

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatUnknown(value) {
  if (value instanceof Error) {
    return value.message
  }

  return String(value)
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function looksLikeSelector(value) {
  return /^(#|\.|@|\[|\/\/|\/|\w+\[|[a-z]+[.#:]|text=|role=|css=|xpath=)/i.test(value)
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttributeValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * @param {any} target
 * @returns {any}
 */
function normalizeSelectorTarget(target) {
  if (typeof target !== 'string' || !target.startsWith('@')) {
    return target
  }

  const handle = escapeAttributeValue(target.slice(1))
  return `[data-test="${handle}"], [data-testid="${handle}"]`
}

/**
 * @param {any} message
 * @returns {{ type: string, text: string, raw: any }}
 */
function normalizeConsoleMessage(message) {
  const type = typeof message?.type === 'function' ? message.type() : message?.type || 'log'
  const text = typeof message?.text === 'function' ? message.text() : message?.text || String(message)

  return {
    type,
    text,
    raw: message,
  }
}

/**
 * @param {any} rawPage
 * @param {any} target
 * @returns {any}
 */
function locatorForTarget(rawPage, target) {
  if (typeof target !== 'string' || looksLikeSelector(target)) {
    return null
  }

  if (typeof rawPage.getByLabel === 'function') {
    return rawPage.getByLabel(target)
  }

  if (typeof rawPage.getByText === 'function') {
    return rawPage.getByText(target)
  }

  return null
}

/**
 * @param {any} rawPage
 * @param {any} target
 * @returns {any}
 */
function textLocatorForTarget(rawPage, target) {
  if (typeof target !== 'string' || looksLikeSelector(target)) {
    return null
  }

  if (typeof rawPage.getByText === 'function') {
    return rawPage.getByText(target)
  }

  return null
}

/**
 * @param {any} locator
 * @param {string} action
 * @param {any[]} args
 * @returns {Promise<any>}
 */
async function callLocatorValue(locator, action, args = []) {
  const target = typeof locator?.first === 'function' ? locator.first() : locator

  if (typeof target?.[action] !== 'function') {
    return undefined
  }

  return target[action](...args)
}

/**
 * @param {any} locator
 * @param {string} action
 * @param {any[]} args
 * @returns {Promise<boolean>}
 */
async function callLocatorAction(locator, action, args = []) {
  const target = typeof locator?.first === 'function' ? locator.first() : locator

  if (typeof target?.[action] !== 'function') {
    return false
  }

  await target[action](...args)
  return true
}

/**
 * @param {string} host
 * @returns {string}
 */
function normalizeHost(host) {
  if (/^https?:\/\//i.test(host)) {
    return host
  }

  return `http://${host}`
}

/**
 * @param {any} frame
 * @param {any} parentRawPage
 * @returns {any}
 */
function createFrameAdapter(frame, parentRawPage) {
  if (typeof frame?.click === 'function' || typeof frame?.goto === 'function') {
    return frame
  }

  const locatorAction = async (selector, action, args = []) => {
    const locator = frame?.locator?.(normalizeSelectorTarget(selector))
    if (typeof locator?.[action] !== 'function') {
      throw new TypeError(`Sounding browser frame does not support ${action}().`)
    }

    return locator[action](...args)
  }

  return {
    locator: typeof frame?.locator === 'function' ? frame.locator.bind(frame) : undefined,
    getByText: typeof frame?.getByText === 'function' ? frame.getByText.bind(frame) : undefined,
    getByLabel: typeof frame?.getByLabel === 'function' ? frame.getByLabel.bind(frame) : undefined,
    url: typeof parentRawPage?.url === 'function' ? parentRawPage.url.bind(parentRawPage) : undefined,
    title: typeof parentRawPage?.title === 'function' ? parentRawPage.title.bind(parentRawPage) : undefined,
    click: (selector, options) => locatorAction(selector, 'click', [options]),
    fill: (selector, value, options) => locatorAction(selector, 'fill', [value, options]),
    type: (selector, value, options) => locatorAction(selector, 'type', [value, options]),
    press: (selector, key, options) => locatorAction(selector, 'press', [key, options]),
    selectOption: (selector, value, options) => locatorAction(selector, 'selectOption', [value, options]),
    check: (selector, options) => locatorAction(selector, 'check', [options]),
    uncheck: (selector, options) => locatorAction(selector, 'uncheck', [options]),
    hover: (selector, options) => locatorAction(selector, 'hover', [options]),
    setInputFiles: (selector, files, options) => locatorAction(selector, 'setInputFiles', [files, options]),
    waitForSelector: (selector, options) => locatorAction(selector, 'waitFor', [options]),
    evaluate: typeof parentRawPage?.evaluate === 'function' ? parentRawPage.evaluate.bind(parentRawPage) : undefined,
    keyboard: parentRawPage?.keyboard,
    screenshot: typeof parentRawPage?.screenshot === 'function' ? parentRawPage.screenshot.bind(parentRawPage) : undefined,
  }
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isSoundingBrowserPage(value) {
  return Boolean(value?.[SOUNDING_BROWSER_PAGE])
}

/**
 * @param {any} page
 * @returns {any}
 */
function getRawPage(page) {
  return isSoundingBrowserPage(page) ? page.raw : page
}

/**
 * @param {any} page
 * @returns {any}
 */
function getBrowserPageState(page) {
  return isSoundingBrowserPage(page) ? page.__soundingState : null
}

/**
 * @param {any} page
 * @returns {string}
 */
function getBrowserPageUrl(page) {
  const rawPage = getRawPage(page)
  return typeof rawPage?.url === 'function' ? rawPage.url() : ''
}

/**
 * @param {any} page
 * @returns {{ javascriptErrors: number, consoleMessages: number, consoleErrors: number }}
 */
function getBrowserPageSmokeCheckpoint(page) {
  const state = getBrowserPageState(page)

  return {
    javascriptErrors: state?.javascriptErrors?.length || 0,
    consoleMessages: state?.consoleMessages?.length || 0,
    consoleErrors: state?.consoleErrors?.length || 0,
  }
}

/**
 * @param {any} page
 * @param {any} target
 * @param {{ javascriptErrors: number, consoleMessages: number, consoleErrors: number }} checkpoint
 * @returns {any}
 */
function createBrowserPageCollectionEntry(page, target, checkpoint) {
  const state = getBrowserPageState(page)

  return {
    target,
    page,
    project: state?.project,
    currentUrl: getBrowserPageUrl(page),
    javascriptErrors: (state?.javascriptErrors || []).slice(checkpoint.javascriptErrors),
    consoleMessages: (state?.consoleMessages || []).slice(checkpoint.consoleMessages),
    consoleErrors: (state?.consoleErrors || []).slice(checkpoint.consoleErrors),
  }
}

/**
 * @param {any} entry
 * @returns {boolean}
 */
function browserPageCollectionEntryHasSmoke(entry) {
  return Boolean(entry?.javascriptErrors?.length || entry?.consoleErrors?.length)
}

/**
 * @param {any[]} entries
 * @returns {any}
 */
function createBrowserPageCollection(entries) {
  return {
    [SOUNDING_BROWSER_PAGE_COLLECTION]: true,
    entries,
    pages: entries.map((entry) => entry.page),
    get length() {
      return entries.length
    },
    [Symbol.iterator]() {
      return entries[Symbol.iterator]()
    },
  }
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isSoundingBrowserPageCollection(value) {
  return Boolean(value?.[SOUNDING_BROWSER_PAGE_COLLECTION])
}

/**
 * @param {any} value
 * @returns {any[]}
 */
function getBrowserPageCollectionEntries(value) {
  return isSoundingBrowserPageCollection(value) ? value.entries : []
}

/**
 * @param {any} page
 * @returns {string}
 */
function formatBrowserPageDiagnostics(page) {
  const url = getBrowserPageUrl(page)
  const state = getBrowserPageState(page)
  const lines = []

  if (url) {
    lines.push(`Current URL: ${url}`)
  }

  const artifacts = state?.getArtifacts?.()
  if (artifacts?.screenshot) {
    lines.push(`Screenshot: ${artifacts.screenshot}`)
  }

  if (artifacts?.trace) {
    lines.push(`Trace: ${artifacts.trace}`)
  }

  if (artifacts?.video) {
    lines.push(`Video: ${artifacts.video}`)
  }

  return lines.length ? `\n\nSounding browser diagnostics:\n${lines.map((line) => `- ${line}`).join('\n')}` : ''
}

/**
 * @param {string} message
 * @param {any} page
 */
function failWithBrowserDiagnostics(message, page) {
  assert.fail(`${message}${formatBrowserPageDiagnostics(page)}`)
}

/**
 * @param {any} rawPage
 * @param {{
 *   project?: string,
 *   login?: { as?: Function, withPassword?: Function },
 *   getArtifacts?: () => any,
 * }} [options]
 * @returns {any}
 */
function createSoundingBrowserPage(rawPage, options = {}) {
  if (isSoundingBrowserPage(rawPage)) {
    return rawPage
  }

  const state = {
    host: null,
    project: options.project,
    login: options.login,
    javascriptErrors: [],
    consoleMessages: [],
    consoleErrors: [],
    getArtifacts: options.getArtifacts || (() => null),
  }
  let wrapper = null

  if (typeof rawPage?.on === 'function') {
    rawPage.on('pageerror', (error) => {
      state.javascriptErrors.push(error)
    })
    rawPage.on('console', (message) => {
      const normalized = normalizeConsoleMessage(message)
      state.consoleMessages.push(normalized)

      if (normalized.type === 'error') {
        state.consoleErrors.push(normalized)
      }
    })
  }

  function resolveNavigationTarget(target) {
    if (!state.host || typeof target !== 'string' || !target.startsWith('/')) {
      return target
    }

    return new URL(target, normalizeHost(state.host)).toString()
  }

  async function performNavigate(target, navigationOptions) {
    if (typeof rawPage?.goto !== 'function') {
      throw new TypeError('Sounding browser page navigation requires a Playwright page with goto().')
    }

    await rawPage.goto(resolveNavigationTarget(target), navigationOptions)
  }

  async function performClick(target, actionOptions) {
    const locator = textLocatorForTarget(rawPage, target)

    if (locator && (await callLocatorAction(locator, 'click', [actionOptions]))) {
      return
    }

    await rawPage.click(normalizeSelectorTarget(target), actionOptions)
  }

  async function performFill(target, value, actionOptions) {
    const locator = locatorForTarget(rawPage, target)

    if (locator && (await callLocatorAction(locator, 'fill', [value, actionOptions]))) {
      return
    }

    await rawPage.fill(normalizeSelectorTarget(target), value, actionOptions)
  }

  async function performTypeSlowly(target, value, actionOptions = {}) {
    const optionsWithDelay = {
      delay: 50,
      ...actionOptions,
    }
    const locator = locatorForTarget(rawPage, target)

    if (locator && (await callLocatorAction(locator, 'pressSequentially', [value, optionsWithDelay]))) {
      return
    }

    if (locator && (await callLocatorAction(locator, 'type', [value, optionsWithDelay]))) {
      return
    }

    if (typeof rawPage?.type === 'function') {
      await rawPage.type(normalizeSelectorTarget(target), value, optionsWithDelay)
      return
    }

    await performFill(target, value, actionOptions)
  }

  async function performClear(target, actionOptions) {
    await performFill(target, '', actionOptions)
  }

  async function performAppend(target, value, actionOptions) {
    const locator = locatorForTarget(rawPage, target)
    const currentValue =
      (locator && (await callLocatorValue(locator, 'inputValue'))) ||
      (typeof rawPage?.inputValue === 'function'
        ? await rawPage.inputValue(normalizeSelectorTarget(target))
        : '')

    await performFill(target, `${currentValue}${value}`, actionOptions)
  }

  async function performPress(target, key, actionOptions) {
    if (key === undefined) {
      await performClick(target, actionOptions)
      return
    }

    await rawPage.press(normalizeSelectorTarget(target), key, actionOptions)
  }

  async function performSelect(target, value, actionOptions) {
    await rawPage.selectOption(normalizeSelectorTarget(target), value, actionOptions)
  }

  async function performCheck(target, actionOptions) {
    const locator = locatorForTarget(rawPage, target)

    if (locator && (await callLocatorAction(locator, 'check', [actionOptions]))) {
      return
    }

    await rawPage.check(normalizeSelectorTarget(target), actionOptions)
  }

  async function performUncheck(target, actionOptions) {
    const locator = locatorForTarget(rawPage, target)

    if (locator && (await callLocatorAction(locator, 'uncheck', [actionOptions]))) {
      return
    }

    await rawPage.uncheck(normalizeSelectorTarget(target), actionOptions)
  }

  async function performHover(target, actionOptions) {
    await rawPage.hover(normalizeSelectorTarget(target), actionOptions)
  }

  async function performAttach(target, files, actionOptions) {
    const locator = locatorForTarget(rawPage, target)

    if (locator && (await callLocatorAction(locator, 'setInputFiles', [files, actionOptions]))) {
      return
    }

    await rawPage.setInputFiles(normalizeSelectorTarget(target), files, actionOptions)
  }

  async function performDrag(source, target, actionOptions) {
    const sourceLocator = locatorForTarget(rawPage, source)
    const targetLocator = locatorForTarget(rawPage, target)

    if (
      sourceLocator &&
      targetLocator &&
      (await callLocatorAction(sourceLocator, 'dragTo', [targetLocator, actionOptions]))
    ) {
      return
    }

    await rawPage.dragAndDrop(
      normalizeSelectorTarget(source),
      normalizeSelectorTarget(target),
      actionOptions
    )
  }

  async function performScroll(target, y) {
    if (typeof target === 'string' && typeof rawPage.locator === 'function') {
      const locator = rawPage.locator(normalizeSelectorTarget(target))
      if (typeof locator?.scrollIntoViewIfNeeded === 'function') {
        await locator.scrollIntoViewIfNeeded()
        return
      }
    }

    const x = typeof target === 'number' ? target : 0
    const nextY = typeof y === 'number' ? y : typeof target === 'number' ? 0 : target || 0

    if (typeof rawPage.evaluate === 'function') {
      await rawPage.evaluate(([left, top]) => window.scrollTo(left, top), [x, nextY])
    }
  }

  async function performWait(target, options) {
    if (typeof target === 'number' && typeof rawPage.waitForTimeout === 'function') {
      await rawPage.waitForTimeout(target)
      return
    }

    if (typeof target === 'string' && typeof rawPage.waitForSelector === 'function') {
      await rawPage.waitForSelector(normalizeSelectorTarget(target), options)
      return
    }

    if (typeof rawPage.waitForLoadState === 'function') {
      await rawPage.waitForLoadState(target || 'load', options)
    }
  }

  async function performResize(widthOrViewport, height) {
    if (typeof rawPage?.setViewportSize !== 'function') {
      throw new TypeError('Sounding browser page resize() requires a Playwright page with setViewportSize().')
    }

    const viewport =
      typeof widthOrViewport === 'object'
        ? widthOrViewport
        : {
            width: widthOrViewport,
            height,
          }

    await rawPage.setViewportSize(viewport)
  }

  async function performKey(key, options) {
    if (typeof rawPage?.keyboard?.press !== 'function') {
      throw new TypeError('Sounding browser page key() requires a Playwright page keyboard.')
    }

    await rawPage.keyboard.press(key, options)
  }

  async function performKeys(keys, options) {
    const entries = Array.isArray(keys) ? keys : [keys]

    for (const key of entries) {
      await performKey(key, options)
    }
  }

  async function performBack(options) {
    await rawPage.goBack(options)
  }

  async function performForward(options) {
    await rawPage.goForward(options)
  }

  async function performReload(options) {
    await rawPage.reload(options)
  }

  async function performDebug() {
    if (typeof rawPage?.pause === 'function') {
      await rawPage.pause()
    }
  }

  async function performWithinFrame(target, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Sounding browser page withinFrame() requires a callback.')
    }

    const frame =
      typeof target === 'string' && typeof rawPage?.frameLocator === 'function'
        ? rawPage.frameLocator(normalizeSelectorTarget(target))
        : typeof target === 'string' && typeof rawPage?.frame === 'function'
          ? rawPage.frame(target)
          : target

    if (!frame) {
      throw new TypeError(`Sounding browser page could not find frame ${formatUnknown(target)}.`)
    }

    const framePage = createSoundingBrowserPage(createFrameAdapter(frame, rawPage), {
      project: state.project,
      login: state.login,
      getArtifacts: state.getArtifacts,
    })

    await callback(framePage)
  }

  async function readText(target) {
    if (target === undefined) {
      return getBrowserPageText(wrapper)
    }

    if (typeof rawPage?.locator === 'function') {
      const locator = rawPage.locator(normalizeSelectorTarget(target))
      if (typeof locator?.textContent === 'function') {
        return (await locator.textContent()) || ''
      }
    }

    if (typeof rawPage?.textContent === 'function') {
      return (await rawPage.textContent(normalizeSelectorTarget(target))) || ''
    }

    return ''
  }

  async function readContent() {
    return typeof rawPage?.content === 'function' ? rawPage.content() : ''
  }

  async function evaluateScript(pageFunction, arg) {
    if (typeof rawPage?.evaluate !== 'function') {
      throw new TypeError('Sounding browser page script() requires a Playwright page with evaluate().')
    }

    return rawPage.evaluate(pageFunction, arg)
  }

  async function captureScreenshot(pathOrOptions, screenshotOptions) {
    if (typeof rawPage?.screenshot !== 'function') {
      throw new TypeError('Sounding browser page screenshot() requires a Playwright page with screenshot().')
    }

    const options =
      typeof pathOrOptions === 'string'
        ? {
            ...screenshotOptions,
            path: pathOrOptions,
          }
        : pathOrOptions || {}

    return rawPage.screenshot(options)
  }

  async function captureElementScreenshot(target, pathOrOptions, screenshotOptions) {
    if (typeof rawPage?.locator !== 'function') {
      throw new TypeError('Sounding browser page screenshotElement() requires a Playwright page with locator().')
    }

    const locator = rawPage.locator(normalizeSelectorTarget(target))
    if (typeof locator?.screenshot !== 'function') {
      throw new TypeError('Sounding browser page screenshotElement() requires a locator with screenshot().')
    }

    const options =
      typeof pathOrOptions === 'string'
        ? {
            ...screenshotOptions,
            path: pathOrOptions,
          }
        : pathOrOptions || {}

    return locator.screenshot(options)
  }

  async function performColorScheme(colorScheme) {
    if (typeof rawPage.emulateMedia === 'function') {
      await rawPage.emulateMedia({ colorScheme })
    }
  }

  async function performLocale(locale) {
    state.locale = locale

    if (typeof rawPage.addInitScript === 'function') {
      await rawPage.addInitScript((nextLocale) => {
        Object.defineProperty(window.navigator, 'language', { get: () => nextLocale })
        Object.defineProperty(window.navigator, 'languages', { get: () => [nextLocale] })
      }, locale)
    }
  }

  async function performTimezone(timezone) {
    state.timezone = timezone
  }

  async function performUserAgent(userAgent) {
    state.userAgent = userAgent

    if (typeof rawPage.setExtraHTTPHeaders === 'function') {
      await rawPage.setExtraHTTPHeaders({ 'user-agent': userAgent })
    }
  }

  async function performGeolocation(latitudeOrCoordinates, longitude, accuracy) {
    const geolocation =
      typeof latitudeOrCoordinates === 'object'
        ? latitudeOrCoordinates
        : {
            latitude: latitudeOrCoordinates,
            longitude,
            ...(accuracy === undefined ? {} : { accuracy }),
          }
    state.geolocation = geolocation

    const context = typeof rawPage?.context === 'function' ? rawPage.context() : rawPage?.context
    if (typeof context?.grantPermissions === 'function') {
      await context.grantPermissions(['geolocation'])
    }

    if (typeof context?.setGeolocation === 'function') {
      await context.setGeolocation(geolocation)
    }
  }

  async function performHost(host) {
    state.host = host
  }

  async function performProject(project) {
    state.project = project
  }

  async function performActorLogin(actor, loginOptions) {
    const login = state.login || options.login

    if (!login?.as) {
      throw new TypeError('Sounding browser page actor login requires auth.login.as().')
    }

    await login.as(actor, wrapper, loginOptions)
  }

  function createActionChain(firstAction) {
    let promise = Promise.resolve()

    function enqueue(action) {
      promise = promise.then(action)
      return chain
    }

    const chain = {
      click(target, actionOptions) {
        return enqueue(() => performClick(target, actionOptions))
      },
      type(target, value, actionOptions) {
        return enqueue(() => performFill(target, value, actionOptions))
      },
      fill(target, value, actionOptions) {
        return enqueue(() => performFill(target, value, actionOptions))
      },
      typeSlowly(target, value, actionOptions) {
        return enqueue(() => performTypeSlowly(target, value, actionOptions))
      },
      append(target, value, actionOptions) {
        return enqueue(() => performAppend(target, value, actionOptions))
      },
      clear(target, actionOptions) {
        return enqueue(() => performClear(target, actionOptions))
      },
      press(target, key, actionOptions) {
        return enqueue(() => performPress(target, key, actionOptions))
      },
      select(target, value, actionOptions) {
        return enqueue(() => performSelect(target, value, actionOptions))
      },
      check(target, actionOptions) {
        return enqueue(() => performCheck(target, actionOptions))
      },
      uncheck(target, actionOptions) {
        return enqueue(() => performUncheck(target, actionOptions))
      },
      hover(target, actionOptions) {
        return enqueue(() => performHover(target, actionOptions))
      },
      attach(target, files, actionOptions) {
        return enqueue(() => performAttach(target, files, actionOptions))
      },
      drag(source, target, actionOptions) {
        return enqueue(() => performDrag(source, target, actionOptions))
      },
      scroll(target, y) {
        return enqueue(() => performScroll(target, y))
      },
      wait(target, waitOptions) {
        return enqueue(() => performWait(target, waitOptions))
      },
      resize(widthOrViewport, height) {
        return enqueue(() => performResize(widthOrViewport, height))
      },
      key(key, keyOptions) {
        return enqueue(() => performKey(key, keyOptions))
      },
      keys(keys, keyOptions) {
        return enqueue(() => performKeys(keys, keyOptions))
      },
      navigate(target, navigationOptions) {
        return enqueue(() => performNavigate(target, navigationOptions))
      },
      goto(target, navigationOptions) {
        return enqueue(() => performNavigate(target, navigationOptions))
      },
      back(options) {
        return enqueue(() => performBack(options))
      },
      forward(options) {
        return enqueue(() => performForward(options))
      },
      reload(options) {
        return enqueue(() => performReload(options))
      },
      debug() {
        return enqueue(() => performDebug())
      },
      withinFrame(target, callback) {
        return enqueue(() => performWithinFrame(target, callback))
      },
      as(actor, loginOptions) {
        return enqueue(() => performActorLogin(actor, loginOptions))
      },
      on(project) {
        return enqueue(() => performProject(project))
      },
      onMobile() {
        return enqueue(() => performProject('mobile'))
      },
      inDarkMode() {
        return enqueue(() => performColorScheme('dark'))
      },
      inLightMode() {
        return enqueue(() => performColorScheme('light'))
      },
      withLocale(locale) {
        return enqueue(() => performLocale(locale))
      },
      withTimezone(timezone) {
        return enqueue(() => performTimezone(timezone))
      },
      withUserAgent(userAgent) {
        return enqueue(() => performUserAgent(userAgent))
      },
      withGeolocation(latitudeOrCoordinates, longitude, accuracy) {
        return enqueue(() => performGeolocation(latitudeOrCoordinates, longitude, accuracy))
      },
      withHost(host) {
        return enqueue(() => performHost(host))
      },
      then(onFulfilled, onRejected) {
        return promise.then(() => wrapper).then(onFulfilled, onRejected)
      },
      catch(onRejected) {
        return chain.then(undefined, onRejected)
      },
      finally(onFinally) {
        return promise.finally(onFinally).then(() => wrapper)
      },
    }

    if (firstAction) {
      enqueue(firstAction)
    }

    return chain
  }

  const api = {
    [SOUNDING_BROWSER_PAGE]: true,
    __soundingState: state,
    raw: rawPage,
    playwrightPage: rawPage,
    get javascriptErrors() {
      return state.javascriptErrors
    },
    get consoleMessages() {
      return state.consoleMessages
    },
    get consoleErrors() {
      return state.consoleErrors
    },
    navigate(target, navigationOptions) {
      return createActionChain(() => performNavigate(target, navigationOptions))
    },
    goto(target, navigationOptions) {
      return createActionChain(() => performNavigate(target, navigationOptions))
    },
    click(target, actionOptions) {
      return createActionChain(() => performClick(target, actionOptions))
    },
    type(target, value, actionOptions) {
      return createActionChain(() => performFill(target, value, actionOptions))
    },
    fill(target, value, actionOptions) {
      return createActionChain(() => performFill(target, value, actionOptions))
    },
    typeSlowly(target, value, actionOptions) {
      return createActionChain(() => performTypeSlowly(target, value, actionOptions))
    },
    append(target, value, actionOptions) {
      return createActionChain(() => performAppend(target, value, actionOptions))
    },
    clear(target, actionOptions) {
      return createActionChain(() => performClear(target, actionOptions))
    },
    press(target, key, actionOptions) {
      return createActionChain(() => performPress(target, key, actionOptions))
    },
    select(target, value, actionOptions) {
      return createActionChain(() => performSelect(target, value, actionOptions))
    },
    check(target, actionOptions) {
      return createActionChain(() => performCheck(target, actionOptions))
    },
    uncheck(target, actionOptions) {
      return createActionChain(() => performUncheck(target, actionOptions))
    },
    hover(target, actionOptions) {
      return createActionChain(() => performHover(target, actionOptions))
    },
    attach(target, files, actionOptions) {
      return createActionChain(() => performAttach(target, files, actionOptions))
    },
    drag(source, target, actionOptions) {
      return createActionChain(() => performDrag(source, target, actionOptions))
    },
    scroll(target, y) {
      return createActionChain(() => performScroll(target, y))
    },
    wait(target, waitOptions) {
      return createActionChain(() => performWait(target, waitOptions))
    },
    resize(widthOrViewport, height) {
      return createActionChain(() => performResize(widthOrViewport, height))
    },
    key(key, keyOptions) {
      return createActionChain(() => performKey(key, keyOptions))
    },
    keys(keys, keyOptions) {
      return createActionChain(() => performKeys(keys, keyOptions))
    },
    back(options) {
      return createActionChain(() => performBack(options))
    },
    forward(options) {
      return createActionChain(() => performForward(options))
    },
    reload(options) {
      return createActionChain(() => performReload(options))
    },
    debug() {
      return createActionChain(() => performDebug())
    },
    withinFrame(target, callback) {
      return createActionChain(() => performWithinFrame(target, callback))
    },
    as(actor, loginOptions) {
      return createActionChain(() => performActorLogin(actor, loginOptions))
    },
    on(project) {
      return createActionChain(() => performProject(project))
    },
    onMobile() {
      return createActionChain(() => performProject('mobile'))
    },
    inDarkMode() {
      return createActionChain(() => performColorScheme('dark'))
    },
    inLightMode() {
      return createActionChain(() => performColorScheme('light'))
    },
    withLocale(locale) {
      return createActionChain(() => performLocale(locale))
    },
    withTimezone(timezone) {
      return createActionChain(() => performTimezone(timezone))
    },
    withUserAgent(userAgent) {
      return createActionChain(() => performUserAgent(userAgent))
    },
    withGeolocation(latitudeOrCoordinates, longitude, accuracy) {
      return createActionChain(() => performGeolocation(latitudeOrCoordinates, longitude, accuracy))
    },
    withHost(host) {
      return createActionChain(() => performHost(host))
    },
    url() {
      return getBrowserPageUrl(wrapper)
    },
    text(target) {
      return readText(target)
    },
    content() {
      return readContent()
    },
    html() {
      return readContent()
    },
    script(pageFunction, arg) {
      return evaluateScript(pageFunction, arg)
    },
    screenshot(pathOrOptions, screenshotOptions) {
      return captureScreenshot(pathOrOptions, screenshotOptions)
    },
    screenshotElement(target, pathOrOptions, screenshotOptions) {
      return captureElementScreenshot(target, pathOrOptions, screenshotOptions)
    },
  }

  wrapper = new Proxy(api, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver)
      }

      const value = rawPage?.[property]
      return typeof value === 'function' ? value.bind(rawPage) : value
    },
    set(target, property, value, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.set(target, property, value, receiver)
      }

      rawPage[property] = value
      return true
    },
  })

  return wrapper
}

/**
 * @param {() => any} getPage
 * @returns {any}
 */
function createMutableBrowserPage(getPage) {
  function currentPage() {
    const page = getPage()

    if (!page) {
      throw new TypeError('Sounding browser page is not open yet.')
    }

    return page
  }

  const api = {
    [SOUNDING_BROWSER_PAGE]: true,
    get __soundingState() {
      return getBrowserPageState(currentPage())
    },
    get raw() {
      return currentPage().raw
    },
    get playwrightPage() {
      return currentPage().playwrightPage
    },
    get javascriptErrors() {
      return currentPage().javascriptErrors
    },
    get consoleMessages() {
      return currentPage().consoleMessages
    },
    get consoleErrors() {
      return currentPage().consoleErrors
    },
  }

  return new Proxy(api, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver)
      }

      const value = currentPage()?.[property]
      return typeof value === 'function' ? value.bind(currentPage()) : value
    },
    set(target, property, value, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.set(target, property, value, receiver)
      }

      currentPage()[property] = value
      return true
    },
  })
}

/**
 * @param {any} page
 * @param {{
 *   login?: { as?: Function },
 *   transport?: string,
 *   ensureOpen?: () => Promise<any>,
 *   switchProject?: (project: string) => Promise<any>,
 * }} [options]
 * @returns {Function & { as(actor: any, options?: any): Function, all(targets: any, options?: any): Promise<any> }}
 */
function createBrowserVisit(page, options = {}) {
  function createVisitChain(target, navigationOptions) {
    const before = []
    const after = []
    let project = null

    function enqueueBefore(action) {
      before.push(action)
      return chain
    }

    function enqueueAfter(action) {
      after.push(action)
      return chain
    }

    async function run() {
      if (project) {
        if (typeof options.switchProject === 'function') {
          await options.switchProject(project)
        } else {
          await page.on(project)
        }
      } else if (typeof options.ensureOpen === 'function') {
        await options.ensureOpen()
      }

      for (const action of before) {
        await action()
      }

      await page.navigate(target, navigationOptions)

      for (const action of after) {
        await action()
      }

      return page
    }

    const chain = {
      click(actionTarget, actionOptions) {
        return enqueueAfter(() => page.click(actionTarget, actionOptions))
      },
      type(actionTarget, value, actionOptions) {
        return enqueueAfter(() => page.type(actionTarget, value, actionOptions))
      },
      fill(actionTarget, value, actionOptions) {
        return enqueueAfter(() => page.fill(actionTarget, value, actionOptions))
      },
      typeSlowly(actionTarget, value, actionOptions) {
        return enqueueAfter(() => page.typeSlowly(actionTarget, value, actionOptions))
      },
      append(actionTarget, value, actionOptions) {
        return enqueueAfter(() => page.append(actionTarget, value, actionOptions))
      },
      clear(actionTarget, actionOptions) {
        return enqueueAfter(() => page.clear(actionTarget, actionOptions))
      },
      press(actionTarget, key, actionOptions) {
        return enqueueAfter(() => page.press(actionTarget, key, actionOptions))
      },
      select(actionTarget, value, actionOptions) {
        return enqueueAfter(() => page.select(actionTarget, value, actionOptions))
      },
      check(actionTarget, actionOptions) {
        return enqueueAfter(() => page.check(actionTarget, actionOptions))
      },
      uncheck(actionTarget, actionOptions) {
        return enqueueAfter(() => page.uncheck(actionTarget, actionOptions))
      },
      hover(actionTarget, actionOptions) {
        return enqueueAfter(() => page.hover(actionTarget, actionOptions))
      },
      attach(actionTarget, files, actionOptions) {
        return enqueueAfter(() => page.attach(actionTarget, files, actionOptions))
      },
      drag(source, actionTarget, actionOptions) {
        return enqueueAfter(() => page.drag(source, actionTarget, actionOptions))
      },
      scroll(actionTarget, y) {
        return enqueueAfter(() => page.scroll(actionTarget, y))
      },
      wait(actionTarget, waitOptions) {
        return enqueueAfter(() => page.wait(actionTarget, waitOptions))
      },
      resize(widthOrViewport, height) {
        return enqueueBefore(() => page.resize(widthOrViewport, height))
      },
      key(key, keyOptions) {
        return enqueueAfter(() => page.key(key, keyOptions))
      },
      keys(keys, keyOptions) {
        return enqueueAfter(() => page.keys(keys, keyOptions))
      },
      back(options) {
        return enqueueAfter(() => page.back(options))
      },
      forward(options) {
        return enqueueAfter(() => page.forward(options))
      },
      reload(options) {
        return enqueueAfter(() => page.reload(options))
      },
      debug() {
        return enqueueAfter(() => page.debug())
      },
      withinFrame(frameTarget, callback) {
        return enqueueAfter(() => page.withinFrame(frameTarget, callback))
      },
      as(actor, loginOptions) {
        return enqueueBefore(() => page.as(actor, loginOptions))
      },
      on(projectName) {
        project = String(projectName)
        return chain
      },
      onMobile() {
        project = 'mobile'
        return chain
      },
      inDarkMode() {
        return enqueueBefore(() => page.inDarkMode())
      },
      inLightMode() {
        return enqueueBefore(() => page.inLightMode())
      },
      withLocale(locale) {
        return enqueueBefore(() => page.withLocale(locale))
      },
      withTimezone(timezone) {
        return enqueueBefore(() => page.withTimezone(timezone))
      },
      withUserAgent(userAgent) {
        return enqueueBefore(() => page.withUserAgent(userAgent))
      },
      withGeolocation(latitudeOrCoordinates, longitude, accuracy) {
        return enqueueBefore(() =>
          page.withGeolocation(latitudeOrCoordinates, longitude, accuracy)
        )
      },
      withHost(host) {
        return enqueueBefore(() => page.withHost(host))
      },
      then(onFulfilled, onRejected) {
        return run().then(onFulfilled, onRejected)
      },
      catch(onRejected) {
        return chain.then(undefined, onRejected)
      },
      finally(onFinally) {
        return run().finally(onFinally)
      },
    }

    return chain
  }

  async function visitAll(targets, visitAllOptions = {}) {
    const routeTargets = Array.isArray(targets) ? targets : [targets]
    const {
      project,
      ...navigationOptions
    } = visitAllOptions || {}
    const entries = []

    for (const target of routeTargets) {
      if (project) {
        if (typeof options.switchProject === 'function') {
          await options.switchProject(project)
        } else {
          await page.on(project)
        }
      } else if (typeof options.ensureOpen === 'function') {
        await options.ensureOpen()
      }

      const checkpoint = getBrowserPageSmokeCheckpoint(page)
      await page.navigate(target, navigationOptions)
      const entry = createBrowserPageCollectionEntry(page, target, checkpoint)
      entries.push(entry)

      if (browserPageCollectionEntryHasSmoke(entry)) {
        break
      }
    }

    return createBrowserPageCollection(entries)
  }

  const visit = function visit(target, navigationOptions) {
    return createVisitChain(target, navigationOptions)
  }

  Object.defineProperty(visit, 'transport', {
    value: options.transport || 'browser',
    enumerable: true,
  })

  visit.as = function as(actor, loginOptions) {
    return function visitAsActor(target, navigationOptions) {
      return createVisitChain(target, navigationOptions).as(actor, loginOptions)
    }
  }

  visit.all = visitAll

  return visit
}

async function getBrowserPageText(page) {
  const rawPage = getRawPage(page)

  if (typeof rawPage?.locator === 'function') {
    const body = rawPage.locator('body')
    if (typeof body?.textContent === 'function') {
      return (await body.textContent()) || ''
    }
  }

  if (typeof rawPage?.textContent === 'function') {
    return (await rawPage.textContent('body')) || ''
  }

  if (typeof rawPage?.content === 'function') {
    return (await rawPage.content()) || ''
  }

  return ''
}

module.exports = {
  SOUNDING_BROWSER_PAGE,
  SOUNDING_BROWSER_PAGE_COLLECTION,
  browserPageCollectionEntryHasSmoke,
  createBrowserPageCollection,
  createBrowserVisit,
  createMutableBrowserPage,
  createSoundingBrowserPage,
  failWithBrowserDiagnostics,
  formatBrowserPageDiagnostics,
  getBrowserPageCollectionEntries,
  getBrowserPageState,
  getBrowserPageText,
  getBrowserPageUrl,
  getRawPage,
  isSoundingBrowserPage,
  isSoundingBrowserPageCollection,
}
