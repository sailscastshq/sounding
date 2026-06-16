/**
 * Shared TypeScript-consumable JSDoc typedefs for Sounding's public API.
 *
 * These comments are intentionally colocated with the JavaScript source so JSDoc
 * stays the source of truth for editor autocomplete and local type checks.
 *
 * @typedef {'virtual' | 'http'} SoundingTransport
 *
 * @typedef {Record<string, any>} AnyRecord
 *
 * @typedef {string | number | boolean | null} JsonPrimitive
 *
 * @typedef {JsonPrimitive | any[] | AnyRecord} JsonValue
 *
 * @typedef {{
 *   id?: string | number,
 *   email?: string,
 *   fullName?: string,
 *   team?: string | number,
 *   teamId?: string | number,
 *   headers?: HeadersInit | AnyRecord,
 *   session?: AnyRecord,
 *   sounding?: {
 *     headers?: HeadersInit | AnyRecord,
 *     session?: AnyRecord,
 *   },
 *   [key: string]: any,
 * }} SoundingActor
 *
 * @typedef {RequestInit & {
 *   headers?: HeadersInit | AnyRecord,
 *   session?: AnyRecord,
 *   transport?: SoundingTransport,
 *   baseUrl?: string,
 *   requestOptions?: SoundingRequestOptions,
 *   [key: string]: any,
 * }} SoundingRequestOptions
 *
 * @typedef {{
 *   raw: unknown,
 *   ok: boolean,
 *   status: number,
 *   statusText: string,
 *   url?: string,
 *   request?: {
 *     method: string,
 *     target: string,
 *     transport: SoundingTransport | 'socket',
 *     url?: string,
 *     headers?: HeadersInit | AnyRecord,
 *   },
 *   redirected: boolean,
 *   session?: AnyRecord,
 *   headers: Headers,
 *   body: string,
 *   data: any,
 *   header(name: string): string | null,
 *   text(): Promise<string>,
 *   json(): Promise<any>,
 * }} SoundingResponse
 *
 * @typedef {{
 *   readonly transport: SoundingTransport,
 *   request(method: string, target: string, options?: SoundingRequestOptions): Promise<SoundingResponse>,
 *   get(target: string, options?: SoundingRequestOptions): Promise<SoundingResponse>,
 *   head(target: string, options?: SoundingRequestOptions): Promise<SoundingResponse>,
 *   post(target: string, payload?: any, options?: SoundingRequestOptions): Promise<SoundingResponse>,
 *   put(target: string, payload?: any, options?: SoundingRequestOptions): Promise<SoundingResponse>,
 *   patch(target: string, payload?: any, options?: SoundingRequestOptions): Promise<SoundingResponse>,
 *   delete(target: string, payload?: any, options?: SoundingRequestOptions): Promise<SoundingResponse>,
 *   clearSession(): void,
 *   withHeaders(headers?: HeadersInit | AnyRecord): SoundingRequestClient,
 *   withSession(session?: AnyRecord): SoundingRequestClient,
 *   using(transport: SoundingTransport): SoundingRequestClient,
 *   as(actor?: SoundingActor | string | null): SoundingRequestClient,
 * }} SoundingRequestClient
 *
 * @typedef {SoundingRequestOptions & {
 *   component?: string,
 *   only?: string[],
 *   except?: string[],
 *   reset?: string[],
 *   errorBag?: string,
 *   version?: string,
 * }} SoundingVisitOptions
 *
 * @typedef {{
 *   (target: string, options?: SoundingVisitOptions): Promise<SoundingResponse>;
 *   readonly transport: SoundingTransport;
 *   get(target: string, options?: SoundingVisitOptions): Promise<SoundingResponse>;
 *   head(target: string, options?: SoundingVisitOptions): Promise<SoundingResponse>;
 *   post(target: string, payload?: any, options?: SoundingVisitOptions): Promise<SoundingResponse>;
 *   put(target: string, payload?: any, options?: SoundingVisitOptions): Promise<SoundingResponse>;
 *   patch(target: string, payload?: any, options?: SoundingVisitOptions): Promise<SoundingResponse>;
 *   delete(target: string, payload?: any, options?: SoundingVisitOptions): Promise<SoundingResponse>;
 *   del(target: string, payload?: any, options?: SoundingVisitOptions): Promise<SoundingResponse>;
 *   using(transport: SoundingTransport): SoundingVisitClient;
 *   as(actor?: SoundingActor | string | null): SoundingVisitClient;
 * }} SoundingVisitClient
 *
 * @typedef {{
 *   capturedAt?: string,
 *   to?: string | string[],
 *   from?: string,
 *   subject?: string,
 *   text?: string,
 *   html?: string,
 *   ctaUrl?: string,
 *   [key: string]: any,
 * }} SoundingMailMessage
 *
 * @typedef {{
 *   capture(message: SoundingMailMessage): SoundingMailMessage,
 *   all(): SoundingMailMessage[],
 *   latest(): SoundingMailMessage | undefined,
 *   clear(): void,
 * }} SoundingMailbox
 *
 * @typedef {{
 *   install(): boolean,
 *   uninstall(): boolean,
 *   readonly installed: boolean,
 * }} SoundingMailCapture
 *
 * @typedef {{
 *   toBe(expected: any): void,
 *   toEqual(expected: any): void,
 *   toContain(expected: any): void,
 *   toMatch(expected: string | RegExp): void,
 *   toBeTruthy(): void,
 *   toBeFalsy(): void,
 *   toBeDefined(): void,
 *   toHaveStatus(expected: number): void,
 *   toHaveHeader(name: string, expected?: string): void,
 *   toRedirectTo(expected: string): void,
 *   toHaveJsonPath(path: string, expected: any): void,
 *   toHaveSentCount(expected: number): void,
 *   toHaveSentMail(expected?: Partial<SoundingMailMessage> | ((message: SoundingMailMessage) => boolean)): void,
 *   toHaveCtaUrl(expected?: string | RegExp): void,
 *   toHaveSession(path: string, expected?: any): void,
 *   toHaveFlash(type: string, expected?: any): void,
 *   toBeInertiaPage(component: string): void,
 *   toHaveInertiaProp(path: string, expected?: any): void,
 *   toHaveInertiaProps(expected: Record<string, any>): void,
 *   toHaveInertiaPropCount(path: string, expected: number): void,
 *   toHaveOnlyInertiaProps(expected: string[]): void,
 *   toMatchInertiaProp(path: string, expected: string | RegExp): void,
 *   toHaveSharedInertiaProp(path: string, expected?: any): void,
 *   toHaveSharedInertiaProps(expected: Record<string, any>): void,
 *   toHaveInertiaError(path: string, expected?: any): void,
 *   toHaveInertiaErrors(expected?: string | string[] | Record<string, any>): void,
 *   toHaveNoInertiaErrors(): void,
 *   toHaveInertiaPartialReload(expected?: { component?: string, only?: string[], except?: string[], reset?: string[], version?: string, errorBag?: string }): void,
 *   toReceive(event: string, expected?: any, options?: { timeout?: number }): Promise<void>,
 *   toHaveReceived(event: string, expected?: any): void,
 *   not: {
 *     toHaveSentMail(expected?: Partial<SoundingMailMessage> | ((message: SoundingMailMessage) => boolean)): void,
 *     toHaveCtaUrl(expected?: string | RegExp): void,
 *     toHaveSession(path: string, expected?: any): void,
 *     toHaveFlash(type: string, expected?: any): void,
 *     toHaveInertiaProp(path: string, expected?: any): void,
 *     toHaveSharedInertiaProp(path: string, expected?: any): void,
 *     toHaveInertiaError(path: string, expected?: any): void,
 *     toReceive(event: string, expected?: any, options?: { timeout?: number }): Promise<void>,
 *   },
 *   [key: string]: any,
 * }} SoundingExpectation
 *
 * @typedef {{
 *   (actual: any): SoundingExpectation;
 *   withFallback(fallback: (actual: any) => any): (actual: any) => SoundingExpectation | any;
 * }} SoundingExpect
 *
 * @typedef {{
 *   goto(target: string): Promise<any> | any,
 *   fill(selector: string, value: string): Promise<any> | any,
 *   click(selector: string): Promise<any> | any,
 *   check?(selector: string): Promise<any> | any,
 *   [key: string]: any,
 * }} SoundingPage
 *
 * @typedef {'off' | 'on' | 'on-failure'} SoundingBrowserArtifactMode
 *
 * @typedef {boolean | SoundingBrowserArtifactMode} SoundingBrowserArtifactSetting
 *
 * @typedef {{
 *   outputDir: string,
 *   screenshot: SoundingBrowserArtifactSetting,
 *   trace: SoundingBrowserArtifactSetting,
 *   video: SoundingBrowserArtifactSetting,
 *   currentUrl: boolean,
 * }} SoundingBrowserArtifactsConfig
 *
 * @typedef {{
 *   outputDir: string,
 *   screenshot: SoundingBrowserArtifactMode,
 *   trace: SoundingBrowserArtifactMode,
 *   video: SoundingBrowserArtifactMode,
 *   currentUrl: boolean,
 * }} SoundingBrowserResolvedArtifactsConfig
 *
 * @typedef {{
 *   outputDir: string,
 *   directory: string,
 *   project: string,
 *   trialName?: string,
 *   currentUrl?: string,
 *   currentUrlPath?: string,
 *   screenshot?: string,
 *   trace?: string,
 *   video?: string,
 *   errors: Array<{ artifact: string, message: string }>,
 * }} SoundingBrowserArtifacts
 *
 * @typedef {boolean | {
 *   outputDir?: string,
 *   screenshot?: SoundingBrowserArtifactSetting,
 *   trace?: SoundingBrowserArtifactSetting,
 *   video?: SoundingBrowserArtifactSetting,
 *   currentUrl?: boolean,
 * }} SoundingBrowserArtifactsOption
 *
 * @typedef {{
 *   width: number,
 *   height: number,
 * }} SoundingBrowserViewport
 *
 * @typedef {{
 *   name?: string,
 *   type?: 'chromium' | 'firefox' | 'webkit' | string,
 *   device?: string,
 *   viewport?: SoundingBrowserViewport,
 *   contextOptions?: AnyRecord,
 *   launchOptions?: AnyRecord,
 * }} SoundingBrowserProjectConfig
 *
 * @typedef {{
 *   type?: string,
 *   project?: string,
 *   launchOptions?: AnyRecord,
 *   contextOptions?: AnyRecord,
 *   artifacts?: SoundingBrowserArtifactsOption,
 *   trialName?: string,
 * }} SoundingBrowserOpenOptions
 *
 * @typedef {{
 *   playwright: AnyRecord,
 *   browser: AnyRecord,
 *   context: AnyRecord,
 *   page: SoundingPage,
 *   expect?: (actual: any) => any,
 *   project: string,
 *   artifacts: SoundingBrowserResolvedArtifactsConfig,
 *   readonly latestArtifacts?: SoundingBrowserArtifacts | null,
 *   captureFailureArtifacts(error?: unknown): Promise<SoundingBrowserArtifacts>,
 *   closeSessionContext?(): Promise<SoundingBrowserArtifacts>,
 * }} SoundingBrowserSession
 *
 * @typedef {{
 *   open(options?: SoundingBrowserOpenOptions): Promise<SoundingBrowserSession>,
 *   close(): Promise<void>,
 *   readonly active: boolean,
 *   readonly page?: SoundingPage,
 *   readonly context?: AnyRecord,
 *   readonly expect?: (actual: any) => any,
 * }} SoundingBrowserManager
 *
 * @typedef {{
 *   timeout?: number,
 *   headers?: HeadersInit | AnyRecord,
 * }} SoundingSocketRequestOptions
 *
 * @typedef {{
 *   event: string,
 *   data: any,
 *   args: any[],
 *   receivedAt: string,
 * }} SoundingSocketEvent
 *
 * @typedef {{
 *   readonly id?: string,
 *   readonly connected: boolean,
 *   on(event: string, listener: (...args: any[]) => void): SoundingSocketClient,
 *   off(event: string, listener: (...args: any[]) => void): SoundingSocketClient,
 *   events(event?: string): any[],
 *   receive(event: string, options?: { timeout?: number }): Promise<any>,
 *   request(method: string, target: string, payloadOrOptions?: any, options?: SoundingSocketRequestOptions): Promise<SoundingResponse>,
 *   get(target: string, options?: SoundingSocketRequestOptions): Promise<SoundingResponse>,
 *   head(target: string, options?: SoundingSocketRequestOptions): Promise<SoundingResponse>,
 *   post(target: string, payload?: any, options?: SoundingSocketRequestOptions): Promise<SoundingResponse>,
 *   put(target: string, payload?: any, options?: SoundingSocketRequestOptions): Promise<SoundingResponse>,
 *   patch(target: string, payload?: any, options?: SoundingSocketRequestOptions): Promise<SoundingResponse>,
 *   delete(target: string, payload?: any, options?: SoundingSocketRequestOptions): Promise<SoundingResponse>,
 *   close(): Promise<void>,
 * }} SoundingSocketClient
 *
 * @typedef {{
 *   baseUrl?: string,
 *   timeout?: number,
 *   transports?: string[],
 *   path?: string,
 *   headers?: HeadersInit | AnyRecord,
 *   initialConnectionHeaders?: HeadersInit | AnyRecord,
 * }} SoundingSocketConnectOptions
 *
 * @typedef {{
 *   connect(options?: SoundingSocketConnectOptions): Promise<SoundingSocketClient>,
 *   as(actor?: SoundingActor | string | null): {
 *     connect(options?: SoundingSocketConnectOptions): Promise<SoundingSocketClient>,
 *   },
 *   closeAll(): Promise<void>,
 * }} SoundingSocketManager
 *
 * @typedef {{
 *   sequence(nameOrBuilder?: string | ((next: number) => any), maybeBuilder?: (next: number) => any): any,
 *   fake: {
 *     person: { fullName(): string },
 *     internet: { email(): string },
 *     lorem: {
 *       words(count?: number): string,
 *       sentence(count?: number): string,
 *     },
 *   },
 *   seed: any,
 *   sails: SoundingSailsApp,
 * }} SoundingFactoryHelpers
 *
 * @typedef {{
 *   name: string,
 *   __soundingType: 'factory',
 *   definition: AnyRecord | ((helpers: SoundingFactoryHelpers) => AnyRecord),
 *   traits: Array<[string, AnyRecord | ((base: AnyRecord) => AnyRecord)]>,
 *   trait(traitName: string, patch: AnyRecord | ((base: AnyRecord) => AnyRecord)): SoundingFactoryDefinition,
 * }} SoundingFactoryDefinition
 *
 * @typedef {{
 *   trait(traitName: string, patch: AnyRecord | ((base: AnyRecord) => AnyRecord)): SoundingFactoryRegistration,
 * }} SoundingFactoryRegistration
 *
 * @typedef {PromiseLike<any> & {
 *   trait(name: string): SoundingBuilder,
 *   traits(names?: string[]): SoundingBuilder,
 *   with(overrides?: AnyRecord): SoundingBuilder,
 *   withOnly(overrides?: AnyRecord): SoundingBuilder,
 *   value(): any,
 *   catch(onRejected?: ((reason: any) => any) | null): Promise<any>,
 *   finally(onFinally?: (() => void) | null): Promise<any>,
 * }} SoundingBuilder
 *
 * @typedef {{
 *   build(name: string, overrides?: AnyRecord): SoundingBuilder,
 *   create(name: string, overrides?: AnyRecord): SoundingBuilder,
 *   defineFactory: SoundingWorldEngine['defineFactory'],
 *   defineScenario: SoundingWorldEngine['defineScenario'],
 *   sails: SoundingSailsApp,
 *   sequence(nameOrBuilder?: string | ((next: number) => any), maybeBuilder?: (next: number) => any): any,
 *   seed: any,
 *   context: AnyRecord,
 * }} SoundingScenarioHelpers
 *
 * @typedef {{
 *   name: string,
 *   __soundingType: 'scenario',
 *   definition: (helpers: SoundingScenarioHelpers) => Promise<AnyRecord> | AnyRecord,
 * }} SoundingScenarioDefinition
 *
 * @typedef {{
 *   build(name: string, overrides?: AnyRecord, options?: { traits?: string[] }): AnyRecord,
 *   buildMany(name: string, count: number, overrides?: AnyRecord, options?: { traits?: string[] }): Promise<AnyRecord[]>,
 *   create(name: string, overrides?: AnyRecord, options?: { traits?: string[] }): SoundingBuilder,
 *   createMany(name: string, count: number, overrides?: AnyRecord, options?: { traits?: string[] }): Promise<AnyRecord[]>,
 *   defineFactory(name: string, definition: AnyRecord | ((helpers: SoundingFactoryHelpers) => AnyRecord)): SoundingFactoryRegistration,
 *   defineFactory(definition: SoundingFactoryDefinition): SoundingFactoryRegistration,
 *   defineScenario(name: string, definition: SoundingScenarioDefinition['definition']): SoundingScenarioDefinition,
 *   defineScenario(definition: SoundingScenarioDefinition): SoundingScenarioDefinition,
 *   register(definition: SoundingFactoryDefinition | SoundingScenarioDefinition): SoundingFactoryRegistration | SoundingScenarioDefinition,
 *   readonly current: AnyRecord | null,
 *   readonly factories: string[],
 *   readonly scenarios: string[],
 *   reset(options?: { preserveSequences?: boolean }): void,
 *   seed(value: any): any,
 *   sequence(nameOrBuilder?: string | ((next: number) => any), maybeBuilder?: (next: number) => any): any,
 *   use(name: string, context?: AnyRecord): Promise<AnyRecord>,
 * }} SoundingWorldEngine
 *
 * @typedef {{
 *   user: AnyRecord,
 *   email: string,
 *   token: string,
 *   url: string,
 * }} SoundingMagicLink
 *
 * @typedef {{
 *   response: SoundingResponse,
 *   email: string,
 *   message?: SoundingMailMessage,
 *   url?: string,
 * }} SoundingRequestMagicLinkResult
 *
 * @typedef {{
 *   actor: AnyRecord,
 *   email: string,
 *   path: string,
 * }} SoundingBrowserLoginResult
 *
 * @typedef {{
 *   actor: AnyRecord,
 *   email: string,
 *   request: SoundingRequestClient,
 *   response: SoundingResponse,
 * }} SoundingPasswordRequestResult
 *
 * @typedef {{
 *   as(actorOrEmail: SoundingActor | string, page: SoundingPage, options?: AnyRecord): Promise<SoundingMagicLink>,
 *   withPassword(actorOrEmail: SoundingActor | string, page: SoundingPage, options: { password: string, rememberMe?: boolean, returnUrl?: string, [key: string]: any }): Promise<SoundingBrowserLoginResult>,
 * }} SoundingLoginHelpers
 *
 * @typedef {{
 *   conventions: AnyRecord,
 *   resolveActor(actorOrEmail: SoundingActor | string, options?: AnyRecord): Promise<AnyRecord>,
 *   resolveUser(actorOrEmail: SoundingActor | string, options?: AnyRecord): Promise<AnyRecord>,
 *   issueMagicLink(actorOrEmail: SoundingActor | string, options?: AnyRecord): Promise<SoundingMagicLink>,
 *   requestMagicLink(actorOrEmail: SoundingActor | string, options?: AnyRecord): Promise<SoundingRequestMagicLinkResult>,
 *   request: {
 *     withPassword(actorOrEmail: SoundingActor | string, options: { password: string, rememberMe?: boolean, returnUrl?: string, request?: SoundingRequestClient, requestOptions?: SoundingRequestOptions, [key: string]: any }): Promise<SoundingPasswordRequestResult>,
 *   },
 *   login: SoundingLoginHelpers,
 * }} SoundingAuthHelpers
 *
 * @typedef {((identity: string, inputs?: AnyRecord) => Promise<any>) & {
 *   readonly path?: string,
 *   [key: string]: any,
 * }} SoundingHelperRunner
 *
 * @typedef {{
 *   config?: AnyRecord,
 *   hooks?: AnyRecord,
 *   helpers?: AnyRecord,
 *   models?: AnyRecord,
 *   router?: {
 *     route?: (...args: any[]) => any,
 *   },
 *   sounding?: SoundingRuntime,
 *   request?: (...args: any[]) => any,
 *   lower?: (done?: (error?: Error) => void) => any,
 *   [key: string]: any,
 * }} SoundingSailsApp
 *
 * @typedef {{
 *   environments: string[],
 *   app: {
 *     path: string,
 *     environment: string,
 *     quiet: boolean,
 *     loadOptions?: AnyRecord,
 *     liftOptions: AnyRecord,
 *   },
 *   world: {
 *     factories: string,
 *     scenarios: string,
 *   },
 *   datastore: {
 *     mode: 'managed' | 'inherit' | string,
 *     identity: string,
 *     adapter: string,
 *     root: string,
 *     isolation: 'worker' | 'run' | string,
 *   },
 *   browser: {
 *     enabled: boolean,
 *     type: string,
 *     projects: string[] | Array<string | (SoundingBrowserProjectConfig & { name: string })> | Record<string, SoundingBrowserProjectConfig>,
 *     defaultProject: string,
 *     baseUrl?: string,
 *     launchOptions: AnyRecord,
 *     artifacts: SoundingBrowserArtifactsConfig,
 *   },
 *   mail: {
 *     capture: boolean,
 *     layout: string | false,
 *     deliver?: boolean,
 *     mode?: 'capture' | 'passthrough' | string,
 *   },
 *   request: {
 *     transport: SoundingTransport,
 *     baseUrl?: string,
 *   },
 *   sockets: {
 *     enabled: boolean,
 *     timeout: number,
 *     transports: string[],
 *     path: string,
 *     baseUrl?: string,
 *     headers: AnyRecord,
 *     initialConnectionHeaders: AnyRecord,
 *   },
 *   auth: {
 *     defaultActor: string,
 *     modelIdentity: string | null,
 *     sessionKey: string | null,
 *     worldCollection: string | null,
 *     password: {
 *       loginPath: string,
 *       pagePath: string,
 *       pageQuery: AnyRecord,
 *       form: {
 *         email: string,
 *         password: string,
 *         rememberMe: string,
 *         returnUrl: string,
 *       },
 *       selectors: AnyRecord,
 *     },
 *   },
 * }} SoundingConfig
 *
 * @typedef {Partial<SoundingConfig> & {
 *   datastore?: SoundingConfig['datastore'] | 'inherit' | 'managed',
 * }} SoundingUserConfig
 *
 * @typedef {{
 *   mode: string,
 *   identity: string,
 *   config: AnyRecord,
 * }} SoundingDatastoreState
 *
 * @typedef {{
 *   bootedAt: string,
 *   mode: string,
 *   config: SoundingConfig,
 *   datastore: SoundingDatastoreState | null,
 *   mail: {
 *     captureEnabled: boolean,
 *     captureInstalled: boolean,
 *   },
 *   world: {
 *     loadedFiles: string[],
 *   },
 * }} SoundingRuntimeState
 *
 * @typedef {{
 *   sails: SoundingSailsApp,
 *   bootedAt: string,
 *   mode: string,
 *   config: SoundingConfig,
 *   datastore: SoundingDatastoreState | null,
 *   mail: {
 *     captureEnabled: boolean,
 *     captureInstalled: boolean,
 *   },
 *   helpers: SoundingHelperRunner,
 *   mailbox: SoundingMailbox,
 *   world: SoundingWorldEngine,
 *   request: SoundingRequestClient,
 *   visit: SoundingVisitClient,
 *   sockets: SoundingSocketManager,
 *   browser: SoundingBrowserManager,
 *   auth: SoundingAuthHelpers,
 *   login: SoundingLoginHelpers,
 * }} SoundingBootResult
 *
 * @typedef {{
 *   readonly config: SoundingConfig,
 *   readonly appPath: string,
 *   readonly mailbox: SoundingMailbox,
 *   readonly world: SoundingWorldEngine,
 *   readonly helpers: SoundingHelperRunner,
 *   readonly helper: SoundingHelperRunner,
 *   readonly request: SoundingRequestClient,
 *   readonly visit: SoundingVisitClient,
 *   readonly sockets: SoundingSocketManager,
 *   readonly browser: SoundingBrowserManager,
 *   readonly auth: SoundingAuthHelpers,
 *   configure(): SoundingDatastoreState,
 *   readonly datastore: SoundingDatastoreState | null,
 *   boot(options?: { mode?: string }): Promise<SoundingBootResult>,
 *   lower(): Promise<void>,
 *   readonly cacheStats: {
 *     config: { resolutions: number },
 *     worldLoader: { directoryScans: number, moduleLoads: number },
 *   },
 *   invalidateCaches(): void,
 *   readonly state: SoundingRuntimeState | null,
 * }} SoundingRuntime
 *
 * @typedef {{
 *   appPath?: string,
 *   environment?: string,
 *   liftOptions?: AnyRecord,
 *   SailsConstructor?: new (...args: any[]) => SoundingSailsApp,
 *   loadSails?: (appPath: string) => any,
 * }} SoundingAppManagerOptions
 *
 * @typedef {{
 *   load(): Promise<SoundingSailsApp>,
 *   lift(): Promise<SoundingSailsApp>,
 *   runtime(options?: { http?: boolean }): Promise<SoundingRuntime>,
 *   lower(): Promise<void>,
 *   resolveConfig(): SoundingConfig,
 * }} SoundingAppManager
 *
 * @typedef {string | {
 *   name: string,
 *   context?: AnyRecord,
 * }} SoundingTrialWorldOption
 *
 * @typedef {SoundingRequestOptions & {
 *   transport?: SoundingTransport,
 *   browser?: boolean | string | SoundingBrowserOpenOptions,
 *   socket?: boolean | SoundingSocketConnectOptions,
 *   world?: SoundingTrialWorldOption,
 * }} SoundingTestOptions
 *
 * @typedef {AnyRecord & {
 *   t: AnyRecord,
 *   expect: SoundingExpect,
 *   sails: SoundingSailsApp,
 *   request: SoundingRequestClient,
 *   visit: SoundingVisitClient,
 *   sockets: SoundingSocketManager,
 *   auth: SoundingAuthHelpers,
 *   login: SoundingLoginHelpers,
 *   world: SoundingWorldEngine,
 *   mailbox: SoundingMailbox,
 *   browser?: AnyRecord,
 *   browserContext?: AnyRecord,
 *   page?: SoundingPage,
 *   get: SoundingRequestClient['get'],
 *   head: SoundingRequestClient['head'],
 *   post: SoundingRequestClient['post'],
 *   put: SoundingRequestClient['put'],
 *   patch: SoundingRequestClient['patch'],
 *   del: SoundingRequestClient['delete'],
 * }} SoundingTrialContext
 *
 * @typedef {(context: SoundingTrialContext) => any | Promise<any>} SoundingTrialHandler
 *
 * @typedef {{
 *   (title: string, handler: SoundingTrialHandler): unknown;
 *   (title: string, options: SoundingTestOptions, handler: SoundingTrialHandler): unknown;
 * }} SoundingTrialRegistrar
 *
 * @typedef {SoundingTrialRegistrar & {
 *   skip(...args: any[]): unknown,
 *   todo(...args: any[]): unknown,
 *   only?: SoundingTrialRegistrar,
 *   helper: SoundingTrialRegistrar,
 *   endpoint: SoundingTrialRegistrar,
 * }} SoundingTest
 *
 * @typedef {{
 *   defaults: { sounding: SoundingConfig },
 *   configure(): void,
 *   initialize(done: (error?: Error) => void): void,
 *   [key: string]: any,
 * }} SoundingSailsHook
 */

module.exports = {}
