const { test } = require('sounding')

test('emits initial asset tags without eager-loading async chunks', {
  hook: { config: { dontLift: true }, files: {
    '.tmp/public/manifest.json': JSON.stringify({ entries: { app: {
      initial: { js: ['/js/app.a1b2.js'], css: ['/css/app.c3d4.css'] },
      async: { js: ['/js/settings.e5f6.js'] }
    } } })
  } }
}, async ({ sails, hook, expect }) => {
  expect(hook.scripts()).toBe('<script src="/js/app.a1b2.js"></script>')
  expect(hook.styles()).toBe('<link rel="stylesheet" href="/css/app.c3d4.css">')
  expect(sails.config.views.locals.shipwright.scripts()).toBe(hook.scripts())
  expect(sails.config.dontLift).toBe(true)
})
