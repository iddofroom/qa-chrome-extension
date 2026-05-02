# QA Assistant — Chrome Extension

A small **MV3 Chrome extension** that lets you fire a QA report at any backend you control — prompt + page URL + visible-tab screenshot + captured `console.*` log — over a single `POST` with a bearer token.

The endpoint is yours. The extension doesn't talk to any third-party server. Configuration (which sites to watch, which URL to POST to, the bearer secret) lives only in your browser's `chrome.storage.local`.

Originally built for a personal QA-to-Claude-Code pipeline; the runtime is generic enough that any HTTP backend that accepts the documented payload will work.

## Why this exists

You're testing a site you own. You spot a bug. You want to file a report **without leaving the page** — capture the URL, the visible state, what was in the console, and a free-text description, and ship it to wherever you triage bugs.

This extension does that with one click. What happens to the report on your server is up to you (forward to Slack, store in a DB, hand off to an LLM, whatever).

## Quick start

```bash
npm install
npm run build
```

Then in Chrome:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `dist/` folder
3. Pin the extension to the toolbar
4. Click **Settings** in the popup and configure:
   - **API Secret** — sent as `Authorization: Bearer <secret>`
   - **Projects table** — one row per site you want to QA. Each row has a label, an origin pattern (e.g. `https://app.example.com/*`), and an endpoint URL.

When you save, Chrome will ask permission for each new origin. Decline = that origin won't work.

That's it. Open the popup on a configured site and the project auto-selects by URL.

## Request contract

Your endpoint must accept this payload:

```http
POST <endpoint URL>
Authorization: Bearer <secret>
Content-Type: application/json

{
  "prompt":     "string",                  // user's free-text description
  "url":        "string | null",           // current tab URL, if "URL" was checked
  "screenshot": "string | null",           // base64 PNG data URL, if "Screenshot" was checked
  "consoleLog": "string | null"            // newline-joined captured console buffer, if "Console" was checked
}
```

And respond with:

```json
{ "response": "any string you want shown back to the user in the popup" }
```

A minimal Next.js (App Router) example:

```ts
// app/api/qa-assistant/route.ts
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.QA_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  // ...do whatever you want with body.prompt / body.url / body.screenshot / body.consoleLog...
  return Response.json({ response: 'received' });
}
```

## Configuration UI

The options page has two parts:

### API Secret
A single bearer token used for **all** projects. Stored only in `chrome.storage.local`.

### Projects (table)

| Field | Example | What it's for |
|---|---|---|
| Label | `staging` | display name in the popup |
| Origin pattern | `https://app.example.com/*` | Chrome match pattern. Determines which tab auto-selects this project, and where the console-capture content script is registered. Bare hosts like `https://example.com` are auto-normalized to include `/*`. |
| Endpoint URL | `https://app.example.com/api/qa-assistant` | Where the `POST` goes. Must be `https://`, except `http://localhost` / `http://127.0.0.1` (dev only) |

When you save: Chrome prompts for permission on every new origin. Origins no longer in the table are released. The console-capture content script is re-registered to match.

## Security architecture

This is built so an OSS clone can run safely without you having to vet every line:

| Concern | Mitigation |
|---|---|
| Broad install-time permissions | Manifest declares zero static `host_permissions`. Uses `optional_host_permissions: ["<all_urls>"]` and asks per-origin via `chrome.permissions.request` only when you save settings. |
| Console wrapper running on every page | Static `content_scripts.matches` is a placeholder pattern that never matches real sites (build hint only). The real registration is dynamic via `chrome.scripting.registerContentScripts`, scoped to origins you've approved. |
| Secret leaking in transit | Endpoint URL must be `https://` (or `http://localhost` for dev). Validated in the options page **and** re-validated in the background service worker before fetch (defense in depth). |
| Compromised page abusing the extension | `chrome.runtime.onMessage` rejects any sender that isn't the extension's own popup or options page. A content script in a malicious page can't trick the background into fetching with the bearer token. |
| Stale permissions piling up | Every save reconciles: requests new origins, removes ones no longer referenced, re-registers content scripts to match. |
| Secret storage | `chrome.storage.local` only. Never sent anywhere except as `Authorization: Bearer` to your configured endpoint. Never written to disk by us. |
| Console buffer visible to the page | The captured buffer lives on `window.__qaConsoleBuffer` in the page's MAIN world (required to wrap the page's `console.*`). The page can already see its own logs, so this isn't an exfil channel — but treat it as visible to the page, not a private channel. |

## Permissions used

| Permission | Why |
|---|---|
| `activeTab` | Take a screenshot of the currently visible tab when the user clicks "Send" |
| `scripting` | Read the captured console buffer; (re)register content scripts dynamically |
| `storage` | Persist your settings in `chrome.storage.local` |
| `tabs` | Read the active tab's URL to auto-detect which project applies |
| `optional_host_permissions: ["<all_urls>"]` | Granted **per-origin at runtime** — you approve each project's site individually |

## Limitations

- **Console capture only catches logs from the moment the content script is active on the page.** If a page was already open before you approved its origin, refresh.
- **Screenshot is the visible viewport only** (`chrome.tabs.captureVisibleTab`), not the full scrollable page.
- **No Markdown rendering** — the popup shows the response as plain text.
- **No history** — single-shot per click; nothing is remembered between sends except your settings.
- **No retry / queueing** — if your endpoint is down, the click fails and you get the HTTP error.

## Development

```bash
npm run dev        # vite dev with HMR for popup/options
npm run build      # production build → dist/
npm run gen:icons  # regenerate icons from logo.png if you replace it
```

Project layout:

```
src/
  background/   # service worker — message router, fetch relay, sender validation
  content/      # MAIN-world console capture (registered dynamically per origin)
  lib/          # shared modules: storage, match-pattern matcher, perms+scripts sync
  options/      # settings page (projects table + secret)
  popup/        # toolbar popup (auto-detect + send)
```

## Publishing as a Chrome Web Store extension

It's possible, but requires extra work beyond the code:

- A **privacy policy** URL (the extension captures URLs, screenshots, and console logs — Web Store policy requires disclosure even though the data goes only to your own endpoint).
- **Single-purpose statement** in the listing: this extension is a developer/QA tool that forwards bug-report context to a user-configured backend.
- **Permissions justification** for each entry above; reviewers tend to scrutinize `<all_urls>` in `optional_host_permissions`. The honest answer is: the user configures their own per-origin permissions at runtime; the extension defaults to zero host access.
- Store listing assets: 128×128 icon (provided as `logo.png`), screenshots of the popup and options, a category, and a short description.

For private/personal use, **Load unpacked** is the simpler path and skips Web Store review entirely.

## License

MIT. See [LICENSE](LICENSE).
