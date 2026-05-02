// Background service worker. Handles two requests from the popup:
//  - GET_PAGE_CONTEXT: read URL, take screenshot, pull console buffer.
//  - SEND_TO_API: relay the request to the project's endpoint.

interface QaLogEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  ts: number;
  args: string[];
}

interface PageContext {
  url: string | null;
  screenshot: string | null;
  consoleLog: string | null;
}

type Msg =
  | {
      type: 'GET_PAGE_CONTEXT';
      include: { url: boolean; screenshot: boolean; consoleLog: boolean };
    }
  | {
      type: 'SEND_TO_API';
      endpoint: string;
      secret: string;
      body: {
        prompt: string;
        url: string | null;
        screenshot: string | null;
        consoleLog: string | null;
      };
    };

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_CONTEXT') {
    collectPageContext(msg.include)
      .then((ctx) => sendResponse({ ok: true, data: ctx }))
      .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
    return true; // async
  }

  if (msg.type === 'SEND_TO_API') {
    callApi(msg)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
    return true; // async
  }

  return false;
});

async function collectPageContext(include: {
  url: boolean;
  screenshot: boolean;
  consoleLog: boolean;
}): Promise<PageContext> {
  const tab = await getActiveTab();
  if (!tab) throw new Error('לא נמצא טאב פעיל');

  const url = include.url && tab.url ? tab.url : null;

  let screenshot: string | null = null;
  if (include.screenshot) {
    if (typeof tab.windowId !== 'number') {
      throw new Error('הטאב הפעיל לא משויך לחלון');
    }
    screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });
  }

  let consoleLog: string | null = null;
  if (include.consoleLog) {
    if (typeof tab.id !== 'number') {
      throw new Error('הטאב הפעיל בלי id — אי אפשר לקרוא console');
    }
    consoleLog = await readConsoleBuffer(tab.id);
  }

  return { url, screenshot, consoleLog };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function readConsoleBuffer(tabId: number): Promise<string> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => (window as unknown as { __qaConsoleBuffer?: QaLogEntry[] }).__qaConsoleBuffer ?? null,
    });
    const buffer = results[0]?.result as QaLogEntry[] | null | undefined;
    if (!buffer || buffer.length === 0) {
      return '(אין רשומות console — ייתכן שהדף נטען לפני שהתוסף הופעל. רענן את הדף ונסה שוב.)';
    }
    return formatBuffer(buffer);
  } catch (err) {
    return `(שגיאה בקריאת console: ${errorMessage(err)})`;
  }
}

function formatBuffer(buffer: QaLogEntry[]): string {
  return buffer
    .map((e) => {
      const t = new Date(e.ts).toISOString().slice(11, 23); // HH:mm:ss.sss
      return `[${t}] [${e.level.toUpperCase()}] ${e.args.join(' ')}`;
    })
    .join('\n');
}

async function callApi(msg: Extract<Msg, { type: 'SEND_TO_API' }>): Promise<{ response: string }> {
  if (!msg.secret) {
    throw new Error('חסר API secret. פתח את הגדרות התוסף והגדר אותו.');
  }
  let res: Response;
  try {
    res = await fetch(msg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${msg.secret}`,
      },
      body: JSON.stringify(msg.body),
    });
  } catch (err) {
    throw new Error(`שגיאת רשת: ${errorMessage(err)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`שגיאה ${res.status}: ${text || res.statusText}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`תשובה לא תקינה (לא JSON): ${errorMessage(err)}`);
  }

  if (
    typeof json !== 'object' ||
    json === null ||
    typeof (json as { response?: unknown }).response !== 'string'
  ) {
    throw new Error('תשובה לא תקינה — חסר שדה response');
  }
  return json as { response: string };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
