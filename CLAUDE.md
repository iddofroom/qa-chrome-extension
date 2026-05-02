# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (HMR for popup/options; not for content scripts in MAIN world).
- `npm run build` — production build. Runs `tsc --noEmit && vite build`. Output goes to `dist/`. Never commit `dist/`; it's gitignored. Reload the extension in `chrome://extensions` after every build.
- `npm run gen:icons` — regenerate `src/assets/icons/icon-{16,32,48,128}.png` from `logo.png` using `sharp`. Only needed if you replace the logo. Icons themselves are checked in.
- No tests / lint configured. `npx tsc --noEmit` is the type check (also run as part of build).

## Architecture

MV3 Chrome extension built with Vite + `@crxjs/vite-plugin` + TypeScript. Three runtime contexts that talk only via `chrome.runtime.sendMessage` and `chrome.storage.local`:

- **`src/popup/`** — toolbar popup. Reads projects from storage, auto-detects which project applies to the active tab via match patterns, captures user input (prompt + which context to attach), sends the request through the background.
- **`src/options/`** — settings page. Edits the projects table + bearer secret, then **on save** runs the side-effecting reconciliation: `chrome.permissions.request` for new origins, `chrome.permissions.remove` for stale ones, `chrome.scripting.registerContentScripts` for the console-capture script. The save handler MUST run inside the click event so Chrome treats `permissions.request` as user-gestured.
- **`src/background/index.ts`** — service worker. Two responsibilities:
  1. Message router for `GET_PAGE_CONTEXT` (active-tab URL + screenshot via `chrome.tabs.captureVisibleTab` + console buffer via `chrome.scripting.executeScript`) and `SEND_TO_API` (the actual `fetch` to the user's endpoint).
  2. On `chrome.runtime.onStartup` / `onInstalled` re-runs `syncContentScripts` so console capture is restored after browser restarts and extension updates without needing the user to open Options.
- **`src/content/console-capture.ts`** — runs in **MAIN world** at `document_start`, wraps `console.log/info/warn/error`, and listens for `error` + `unhandledrejection`. The buffer lives at `window.__qaConsoleBuffer` (read by the background via an `executeScript` call). MAIN world is required because the page's `console` lives there; switching to ISOLATED would lose page logs.

`src/lib/` holds the cross-context helpers — same code is imported from popup, options, and background:

- **`storage.ts`** — single source of truth for what's persisted. Defines `QaProject` and the storage keys. Everything that reads or writes settings goes through `getProjects/setProjects/getApiSecret/setApiSecret`.
- **`match-pattern.ts`** — Chrome match pattern parser/matcher. `normalizePattern` is forgiving about user input: `https://x` and `https://x/` both become `https://x/*`. Both validation and `matchPatternToRegex` normalize first, so saved patterns from older versions still match without re-saving.
- **`sync-state.ts`** — the reconciliation logic. `requestAndPrunePermissions` filters out manifest-required origins before calling `permissions.remove` (otherwise Chrome throws "You cannot remove required permissions" because of the placeholder in `content_scripts.matches`). `syncContentScripts` reads the bundled content-script path back out of `chrome.runtime.getManifest()` (crxjs hashes the filename, so we can't hard-code it) and registers one entry per project.

## Security model — non-obvious invariants

- **The manifest declares zero static `host_permissions`.** Granted origins are requested at runtime via `optional_host_permissions: ["<all_urls>"]`. If you ever add a static `host_permissions` entry, you also need to teach `manifestRequiredOrigins` about it or `permissions.remove` will fail at save time.
- **`content_scripts` in the manifest is a build hint, not a runtime registration.** Its `matches` is a deliberate placeholder (`https://qa-extension-bundle-only.invalid/*`) that never matches a real URL — it exists only so crxjs bundles `console-capture.ts` and references it from the manifest. The actual content script registration happens in `syncContentScripts`. Don't widen this match thinking you'll get auto-injection; you'll just leak the wrapper to every page.
- **Endpoint URLs must be HTTPS** (or `http://localhost`/`127.0.0.1` for dev). `isAllowedEndpoint` is checked twice on purpose: once in the options page before save, and again in `callApi` before the fetch. The second check is defense in depth — never remove it on the assumption that the popup already validated.
- **`chrome.runtime.onMessage` rejects sender that isn't the extension's own popup or options.** This blocks a compromised page's content script (which lives in a tab with a non-extension URL) from triggering `SEND_TO_API` and exfiltrating the bearer secret. The check is `sender.id === chrome.runtime.id && !sender.tab && sender.url` startsWith `chrome-extension://<id>/src/popup/` or `chrome-extension://<id>/src/options/`. If you add a new entry point that calls `sendMessage`, allow-list it explicitly.
- **The bearer secret never appears anywhere except `chrome.storage.local` and the `Authorization` header on the configured endpoint.** Don't log it, don't put it in URLs, don't echo it back from the popup.

## Branch + deploy workflow

This project follows the `dev` → `main` workflow defined in the parent [`../CLAUDE.md`](../CLAUDE.md). Routine pushes go to `dev`; only push to `main` when the user explicitly says "תפרוס" / "deploy" / similar. There is no Netlify deploy for this repo — `main` is just a "this is what I'm willing to install" marker. After merging to `main`, the user reloads the extension manually.
