import {
  PROJECTS,
  projectFromUrl,
  isLocalhost,
  getProjectById,
  type ProjectConfig,
} from '../config/projects';

const STORAGE_LAST_LOCAL_PROJECT = 'qa.lastLocalProjectId';
const STORAGE_API_SECRET = 'qa.apiSecret';
const STORAGE_ENDPOINT_URL = 'qa.endpointUrl';

interface Els {
  badge: HTMLSpanElement;
  select: HTMLSelectElement;
  prompt: HTMLTextAreaElement;
  cbScreenshot: HTMLInputElement;
  cbUrl: HTMLInputElement;
  cbConsole: HTMLInputElement;
  send: HTMLButtonElement;
  status: HTMLDivElement;
  error: HTMLDivElement;
  response: HTMLDivElement;
  optionsBtn: HTMLButtonElement;
}

// When the user filled "Endpoint URL" in the options page, we send every
// request there and skip the per-domain project map entirely — that's the
// path OSS users take. Empty value => fall back to the hard-coded PROJECTS
// list and auto-detect by tab hostname.
let configuredEndpoint: string | null = null;
let currentProject: ProjectConfig | null = null;
let currentTabUrl: string | undefined;

document.addEventListener('DOMContentLoaded', () => {
  void init();
});

async function init() {
  const els = readEls();
  bindEvents(els);
  await populateProjectUi(els);
}

function readEls(): Els {
  return {
    badge: document.getElementById('project-badge') as HTMLSpanElement,
    select: document.getElementById('project-select') as HTMLSelectElement,
    prompt: document.getElementById('prompt') as HTMLTextAreaElement,
    cbScreenshot: document.getElementById('cb-screenshot') as HTMLInputElement,
    cbUrl: document.getElementById('cb-url') as HTMLInputElement,
    cbConsole: document.getElementById('cb-console') as HTMLInputElement,
    send: document.getElementById('send') as HTMLButtonElement,
    status: document.getElementById('status') as HTMLDivElement,
    error: document.getElementById('error') as HTMLDivElement,
    response: document.getElementById('response') as HTMLDivElement,
    optionsBtn: document.getElementById('open-options') as HTMLButtonElement,
  };
}

function bindEvents(els: Els) {
  els.optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  els.select.addEventListener('change', () => {
    const project = getProjectById(els.select.value);
    if (project) {
      currentProject = project;
      els.badge.textContent = project.label;
      els.badge.className = 'badge badge-ok';
      void chrome.storage.local.set({ [STORAGE_LAST_LOCAL_PROJECT]: project.id });
    }
  });

  els.send.addEventListener('click', () => {
    void handleSend(els);
  });
}

async function populateProjectUi(els: Els) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabUrl = tab?.url;

  const stored = await chrome.storage.local.get(STORAGE_ENDPOINT_URL);
  const overrideUrl = (stored[STORAGE_ENDPOINT_URL] as string | undefined)?.trim();
  if (overrideUrl) {
    configuredEndpoint = overrideUrl;
    els.badge.textContent = `→ ${hostnameOrUrl(overrideUrl)}`;
    els.badge.className = 'badge badge-ok';
    els.badge.title = overrideUrl;
    return;
  }

  const detected = projectFromUrl(currentTabUrl);
  if (detected) {
    currentProject = detected;
    els.badge.textContent = detected.label;
    els.badge.className = 'badge badge-ok';
    return;
  }

  if (isLocalhost(currentTabUrl)) {
    await renderLocalhostSelector(els);
    return;
  }

  // Unknown domain — render selector with no preselect.
  renderProjectSelector(els, null);
  els.badge.textContent = 'לא מזוהה — בחר:';
  els.badge.className = 'badge badge-warn';
}

function hostnameOrUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function renderLocalhostSelector(els: Els) {
  const stored = await chrome.storage.local.get(STORAGE_LAST_LOCAL_PROJECT);
  const lastId = stored[STORAGE_LAST_LOCAL_PROJECT] as string | undefined;
  const last = getProjectById(lastId);

  renderProjectSelector(els, last);

  if (last) {
    currentProject = last;
    els.badge.textContent = `localhost → ${last.label}`;
    els.badge.className = 'badge badge-ok';
  } else {
    els.badge.textContent = 'localhost — בחר פרוייקט:';
    els.badge.className = 'badge badge-warn';
  }
}

function renderProjectSelector(els: Els, preselect: ProjectConfig | null) {
  els.select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— בחר —';
  placeholder.disabled = true;
  placeholder.selected = !preselect;
  els.select.appendChild(placeholder);

  for (const p of PROJECTS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    if (preselect && preselect.id === p.id) opt.selected = true;
    els.select.appendChild(opt);
  }
  els.select.classList.remove('hidden');
}

async function handleSend(els: Els) {
  hideMessage(els.error);
  hideMessage(els.response);
  hideMessage(els.status);

  const prompt = els.prompt.value.trim();
  if (!prompt) {
    showError(els, 'יש לכתוב פרומט.');
    return;
  }

  const endpoint = configuredEndpoint ?? currentProject?.endpoint ?? null;
  if (!endpoint) {
    showError(els, 'יש לבחור פרוייקט (או להגדיר Endpoint URL ב"הגדרות").');
    return;
  }

  const secretRes = await chrome.storage.local.get(STORAGE_API_SECRET);
  const secret = (secretRes[STORAGE_API_SECRET] as string | undefined) ?? '';
  if (!secret) {
    showError(els, 'חסר API secret. לחץ "הגדרות" והגדר אותו.');
    return;
  }

  const include = {
    url: els.cbUrl.checked,
    screenshot: els.cbScreenshot.checked,
    consoleLog: els.cbConsole.checked,
  };

  setLoading(els, true);
  showStatus(els, 'אוסף הקשר…');

  try {
    const ctxRes = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_CONTEXT',
      include,
    });
    if (!ctxRes?.ok) throw new Error(ctxRes?.error ?? 'שגיאה לא ידועה באיסוף הקשר');

    showStatus(els, 'שולח לקלוד…');

    const apiRes = await chrome.runtime.sendMessage({
      type: 'SEND_TO_API',
      endpoint,
      secret,
      body: {
        prompt,
        url: ctxRes.data.url,
        screenshot: ctxRes.data.screenshot,
        consoleLog: ctxRes.data.consoleLog,
      },
    });
    if (!apiRes?.ok) throw new Error(apiRes?.error ?? 'שגיאה לא ידועה מהשרת');

    hideMessage(els.status);
    showResponse(els, apiRes.data.response);
  } catch (err) {
    hideMessage(els.status);
    showError(els, err instanceof Error ? err.message : String(err));
  } finally {
    setLoading(els, false);
  }
}

function setLoading(els: Els, loading: boolean) {
  els.send.disabled = loading;
  els.send.textContent = loading ? 'שולח…' : 'שלח';
}

function showStatus(els: Els, text: string) {
  els.status.textContent = text;
  els.status.classList.remove('hidden');
}

function showError(els: Els, text: string) {
  els.error.textContent = text;
  els.error.classList.remove('hidden');
}

function showResponse(els: Els, text: string) {
  els.response.textContent = text;
  els.response.classList.remove('hidden');
}

function hideMessage(el: HTMLElement) {
  el.classList.add('hidden');
  el.textContent = '';
}
