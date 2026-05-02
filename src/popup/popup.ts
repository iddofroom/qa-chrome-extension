import { matchUrl } from '../lib/match-pattern';
import {
  getApiSecret,
  getProjects,
  type QaProject,
} from '../lib/storage';

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

let projects: QaProject[] = [];
let currentProject: QaProject | null = null;
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
    const project = projects.find((p) => p.id === els.select.value) ?? null;
    if (project) {
      currentProject = project;
      els.badge.textContent = project.label || project.origin;
      els.badge.className = 'badge badge-ok';
    }
  });

  els.send.addEventListener('click', () => {
    void handleSend(els);
  });
}

async function populateProjectUi(els: Els) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabUrl = tab?.url;
  projects = await getProjects();

  if (projects.length === 0) {
    els.badge.textContent = 'אין פרוייקטים — פתח "הגדרות"';
    els.badge.className = 'badge badge-warn';
    return;
  }

  const detected = currentTabUrl
    ? projects.find((p) => matchUrl(p.origin, currentTabUrl!)) ?? null
    : null;

  if (detected) {
    currentProject = detected;
    els.badge.textContent = detected.label || detected.origin;
    els.badge.className = 'badge badge-ok';
    return;
  }

  // No project for this tab — let the user pick manually.
  renderProjectSelector(els, null);
  els.badge.textContent = 'לא מזוהה — בחר:';
  els.badge.className = 'badge badge-warn';
}

function renderProjectSelector(els: Els, preselect: QaProject | null) {
  els.select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— בחר —';
  placeholder.disabled = true;
  placeholder.selected = !preselect;
  els.select.appendChild(placeholder);

  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label || p.origin;
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

  if (!currentProject) {
    showError(els, 'יש לבחור פרוייקט (או להגדיר ב"הגדרות").');
    return;
  }

  const secret = await getApiSecret();
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
      endpoint: currentProject.endpoint,
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
