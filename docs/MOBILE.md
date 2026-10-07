# Mobile And Home-Screen App

The mobile layout uses document scrolling below 1024px. Desktop panes retain
independent scrolling. The header, module sections, presets, dialogs, and
secondary tabs fit narrow screens. Safe-area padding keeps content clear of
iPhone display cutouts and the home indicator. Dialogs use the visual viewport
to remain within the area left by an onscreen keyboard. Mobile form controls
use 16px text to avoid focus zoom on iOS.

## Installation

Open https://ai-engineer-lab.vercel.app in Chrome or Safari on iPhone, choose
Share, then Add to Home Screen. Enable Open as Web App if offered, then Add.
The installed app uses its own icon and opens without browser navigation bars.
The download icon in the app header also provides these steps. On browsers
supporting an install prompt, it opens the native install prompt instead.

This is an installable progressive web app, not an App Store distribution.
Lessons and bundled assets are cached after the first successful online load.
Live experiments, generation, run history, and other API actions need an
internet connection. API responses are not cached by the service worker.
App updates display an Update action so a refresh does not interrupt work.

## Verification

Run `pnpm test:mobile` after installing Playwright Chromium and WebKit with
`pnpm --filter @ail/web exec playwright install chromium webkit`.

The suite builds and serves the production frontend, then checks all four
sections of all eleven modules in Chromium and WebKit at 390px, 320px small-phone
and 740px landscape navigation, reduced viewport heights down to 320px,
reachable bottom controls, desktop pane geometry at 1280px and 1024px,
installation metadata, icon responses, and offline lesson navigation.
Full offline document navigation is tested in Chromium. WebKit tests offline
tab interaction in an already-loaded module because Playwright's WebKit offline
navigation emulation has [a known defect](https://github.com/microsoft/playwright/issues/42775).
WebKit emulation does not reproduce the actual iOS Chrome browser bars or the
native keyboard; physical-device validation remains a separate check.

The Vite PWA plugin generates the manifest and revisioned service worker.
App icons are derived from the favicon by `apps/web/scripts/generate-icons.mjs`.

## Lab Actions

`pnpm test:actions` exercises playgrounds and experiments in all eleven modules
against a separately hosted API, so browser CORS failures are covered. Set
`LAB_TEST_URL` to the production URL to run the same checks after deployment.

Streaming replies preserve Fastify's CORS and rate-limit headers before handing
off the raw response. With `SEED_DEMO_DATA=true`, startup restores the Nimbus
demo collection, dataset, and saved prompts without replacing user documents.
The production demo allows 300 requests per minute per IP: index comparisons
make many requests in a single action. Rate limiting remains enabled.

The current Render deployment uses an ephemeral SQLite path and memory vector
store. Demo fixtures are restored after restart; user uploads and run history
are not guaranteed to persist. Persistent hosting needs a disk-backed database
and vector store. The deployed labs use the mock AI provider.
