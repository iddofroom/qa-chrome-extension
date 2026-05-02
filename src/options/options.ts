import {
  isAllowedEndpoint,
  isValidMatchPattern,
  normalizePattern,
} from '../lib/match-pattern';
import {
  projectOriginPatterns,
  requestAndPrunePermissions,
  syncContentScripts,
} from '../lib/sync-state';
import {
  getApiSecret,
  getProjects,
  setApiSecret,
  setProjects,
  type QaProject,
} from '../lib/storage';

interface RowEls {
  row: HTMLTableRowElement;
  label: HTMLInputElement;
  origin: HTMLInputElement;
  endpoint: HTMLInputElement;
  remove: HTMLButtonElement;
}

const tbodyId = 'projects-tbody';

document.addEventListener('DOMContentLoaded', () => {
  void init();
});

async function init() {
  const secret = document.getElementById('secret') as HTMLInputElement;
  const toggleSecret = document.getElementById('toggle-secret') as HTMLButtonElement;
  const addRow = document.getElementById('add-row') as HTMLButtonElement;
  const save = document.getElementById('save') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;

  secret.value = await getApiSecret();
  const projects = await getProjects();
  const tbody = document.getElementById(tbodyId) as HTMLTableSectionElement;
  if (projects.length === 0) {
    appendBlankRow(tbody);
  } else {
    for (const p of projects) appendRow(tbody, p);
  }

  toggleSecret.addEventListener('click', () => {
    secret.type = secret.type === 'password' ? 'text' : 'password';
  });

  addRow.addEventListener('click', () => {
    appendBlankRow(tbody);
  });

  save.addEventListener('click', () => {
    void handleSave(secret, tbody, status);
  });
}

async function handleSave(
  secretEl: HTMLInputElement,
  tbody: HTMLTableSectionElement,
  status: HTMLDivElement,
) {
  const secretValue = secretEl.value.trim();
  const rows = collectRows(tbody);
  const projects = rows.map(rowToProject);

  // Validate each row.
  const errors: string[] = [];
  const seenIds = new Set<string>();
  projects.forEach((p, i) => {
    const n = i + 1;
    if (!p.label) errors.push(`שורה ${n}: חסרה תווית.`);
    if (!isValidMatchPattern(p.origin)) {
      errors.push(`שורה ${n}: Origin pattern לא תקין (דוגמה: https://example.com/*).`);
    }
    if (!p.endpoint) {
      errors.push(`שורה ${n}: חסר Endpoint URL.`);
    } else if (!isAllowedEndpoint(p.endpoint)) {
      errors.push(`שורה ${n}: Endpoint URL חייב להיות https:// (או http://localhost לפיתוח).`);
    }
    if (seenIds.has(p.id)) errors.push(`שורה ${n}: id כפול.`);
    seenIds.add(p.id);
  });
  if (projects.length > 0 && !secretValue) {
    errors.push('חסר API Secret — נדרש כשיש פרוייקטים מוגדרים.');
  }
  if (errors.length > 0) {
    showStatus(status, errors.join('\n'), true);
    return;
  }

  try {
    // 1) Reconcile permissions FIRST. Has to run inside the click handler so
    //    Chrome accepts it as a user gesture.
    const desired = projectOriginPatterns(projects);
    await requestAndPrunePermissions(desired);

    // 2) Persist.
    await setApiSecret(secretValue);
    await setProjects(projects);

    // 3) Re-register content scripts now that permissions reflect the new state.
    await syncContentScripts(projects);

    showStatus(status, 'נשמר. הרשאות סונכרנו.', false);
  } catch (err) {
    showStatus(
      status,
      `שגיאה בשמירה: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  }
}

function collectRows(tbody: HTMLTableSectionElement): RowEls[] {
  const rows: RowEls[] = [];
  for (const tr of Array.from(tbody.rows)) {
    const inputs = tr.querySelectorAll('input');
    const remove = tr.querySelector('button') as HTMLButtonElement;
    if (inputs.length < 3) continue;
    rows.push({
      row: tr,
      label: inputs[0] as HTMLInputElement,
      origin: inputs[1] as HTMLInputElement,
      endpoint: inputs[2] as HTMLInputElement,
      remove,
    });
  }
  return rows;
}

function rowToProject(r: RowEls): QaProject {
  return {
    id: r.row.dataset.id || crypto.randomUUID(),
    label: r.label.value.trim(),
    origin: normalizePattern(r.origin.value),
    endpoint: r.endpoint.value.trim(),
  };
}

function appendBlankRow(tbody: HTMLTableSectionElement) {
  appendRow(tbody, {
    id: crypto.randomUUID(),
    label: '',
    origin: '',
    endpoint: '',
  });
}

function appendRow(tbody: HTMLTableSectionElement, p: QaProject) {
  const tr = document.createElement('tr');
  tr.dataset.id = p.id;

  tr.appendChild(makeInputCell('text', p.label, 'iddofroom', false));
  tr.appendChild(makeInputCell('text', p.origin, 'https://example.com/*', true));
  tr.appendChild(makeInputCell(
    'url',
    p.endpoint,
    'https://example.com/api/qa-assistant',
    true,
  ));

  const tdRemove = document.createElement('td');
  tdRemove.className = 'col-remove';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.title = 'הסר';
  removeBtn.addEventListener('click', () => {
    tr.remove();
  });
  tdRemove.appendChild(removeBtn);
  tr.appendChild(tdRemove);

  tbody.appendChild(tr);
}

function makeInputCell(
  type: 'text' | 'url',
  value: string,
  placeholder: string,
  ltr: boolean,
): HTMLTableCellElement {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (ltr) input.dir = 'ltr';
  td.appendChild(input);
  return td;
}

function showStatus(el: HTMLDivElement, text: string, isError: boolean) {
  el.textContent = text;
  el.className = isError ? 'status error' : 'status';
  el.classList.remove('hidden');
}
