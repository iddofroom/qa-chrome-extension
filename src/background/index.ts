// Background service worker. Handles two requests from the popup:
//  - GET_PAGE_CONTEXT: read URL, take screenshot, pull console buffer.
//  - SEND_TO_API: relay the request to the project's endpoint.
//
// Hardening:
//  - Both message types reject senders that aren't this extension's own
//    popup or options page (in particular: not content scripts), so a
//    compromised page can't pivot the bearer secret out through us.
//  - SEND_TO_API re-validates the endpoint URL is https:// (or
//    http://localhost) defense-in-depth, even after the popup checked.
//  - On startup/install we re-register dynamic content scripts so console
//    capture survives browser restarts and updates without leaking to
//    origins the user hasn't approved.

import { assertAllowedEndpoint, syncContentScripts } from '../lib/sync-state';
import { getProjects } from '../lib/storage';

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

const EXTENSION_ORIGIN = `chrome-extension://${chrome.runtime.id}`;

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  if (!isTrustedSender(sender)) {
    sendResponse({ ok: false, error: 'Unauthorized sender' });
    return false;
  }

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

// We only accept messages from our own extension's popup / options pages.
// Content scripts run inside web pages — they have a tab id and a url that
// belongs to that page (not chrome-extension://...). Excluding them blocks
// a compromised page from using the background as a credentialed proxy.
function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  if (sender.tab) return false; // content script
  const url = sender.url ?? '';
  return (
    url.startsWith(`${EXTENSION_ORIGIN}/src/popup/`) ||
    url.startsWith(`${EXTENSION_ORIGIN}/src/options/`)
  );
}

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
  assertAllowedEndpoint(msg.endpoint);

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

// Re-register dynamic content scripts on startup / after extension update,
// so console capture works on all approved origins without requiring the
// user to open options first.
async function reregisterContentScripts() {
  try {
    const projects = await getProjects();
    await syncContentScripts(projects);
  } catch (err) {
    console.error('[qa] failed to reregister content scripts on startup', err);
  }
}

chrome.runtime.onStartup.addListener(() => void reregisterContentScripts());
chrome.runtime.onInstalled.addListener(() => void reregisterContentScripts());
