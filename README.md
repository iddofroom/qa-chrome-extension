# QA Assistant — Chrome Extension

Toolbar button that posts `prompt + URL + screenshot + console log` to any HTTPS endpoint you own. Configure once, click to send. MV3, no third-party servers, zero static host permissions — each site you watch is a permission you grant per-origin at runtime.

## Install

```bash
npm install && npm run build
```

`chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/`.

Open the popup → **Settings**:

1. Paste an **API secret** (sent as `Authorization: Bearer <secret>`).
2. Add a row per site: **label**, **origin pattern** (Chrome match pattern; `https://example.com` is auto-normalized to `https://example.com/*`), **endpoint URL** (must be `https://`, except `http://localhost` for dev).
3. Save. Chrome will ask permission for each new origin.

The popup auto-detects which project applies based on the active tab's URL.

## Request contract

Your endpoint receives:

```http
POST <endpoint URL>
Authorization: Bearer <secret>
Content-Type: application/json

{
  "prompt":     string,
  "url":        string | null,
  "screenshot": string | null,    // base64 PNG data URL
  "consoleLog": string | null     // newline-joined captured console buffer
}
```

Each context field is `null` if the user unchecked its box in the popup.

Respond with `{ "response": "any string" }`. The popup displays that string verbatim.

Minimal Next.js endpoint:

```ts
// app/api/qa-assistant/route.ts
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.QA_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  // ...do something with body.prompt / body.url / body.screenshot / body.consoleLog
  return Response.json({ response: 'received' });
}
```

## Security model

- **Zero static host permissions.** `optional_host_permissions: ["<all_urls>"]`; access is granted per-origin at save time and revoked when you remove a row.
- **Console capture is dynamically registered** via `chrome.scripting.registerContentScripts` — the wrapper runs only on approved origins, never globally.
- **Endpoint URL is validated as `https://` (or `http://localhost`) twice** — once in the options page, once in the background before `fetch`.
- **The background message handler rejects senders that aren't the extension's own popup or options page** — a compromised content script can't pivot the bearer secret out.
- **Secret lives only in `chrome.storage.local`** and leaves the browser only as `Authorization: Bearer` to your configured endpoint.

## Limitations

- Console capture starts at content-script registration. If a tab was already open before you approved its origin, refresh.
- Screenshot is the visible viewport, not the full scrollable page.
- One-shot per click — no history, no retry queue, no Markdown rendering.

## Development

```bash
npm run dev        # HMR for popup/options (content scripts in MAIN world don't hot-reload)
npm run build      # tsc --noEmit && vite build → dist/
npm run gen:icons  # regenerate icons from logo.png
```

## License

MIT — see [LICENSE](LICENSE).
