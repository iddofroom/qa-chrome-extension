const STORAGE_API_SECRET = 'qa.apiSecret';
const STORAGE_ENDPOINT_URL = 'qa.endpointUrl';

document.addEventListener('DOMContentLoaded', () => {
  void init();
});

async function init() {
  const secretInput = document.getElementById('secret') as HTMLInputElement;
  const endpointInput = document.getElementById('endpoint') as HTMLInputElement;
  const save = document.getElementById('save') as HTMLButtonElement;
  const toggle = document.getElementById('toggle') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;

  const stored = await chrome.storage.local.get([
    STORAGE_API_SECRET,
    STORAGE_ENDPOINT_URL,
  ]);
  secretInput.value = (stored[STORAGE_API_SECRET] as string | undefined) ?? '';
  endpointInput.value =
    (stored[STORAGE_ENDPOINT_URL] as string | undefined) ?? '';

  toggle.addEventListener('click', () => {
    secretInput.type = secretInput.type === 'password' ? 'text' : 'password';
  });

  save.addEventListener('click', async () => {
    const secretValue = secretInput.value.trim();
    const endpointValue = endpointInput.value.trim();

    if (endpointValue && !isValidHttpUrl(endpointValue)) {
      showStatus(
        status,
        'ה-URL לא תקין. צריך להתחיל ב-http:// או https://',
        true,
      );
      return;
    }

    try {
      await chrome.storage.local.set({
        [STORAGE_API_SECRET]: secretValue,
        [STORAGE_ENDPOINT_URL]: endpointValue,
      });
      showStatus(status, 'נשמר.', false);
    } catch (err) {
      showStatus(
        status,
        `שגיאה: ${err instanceof Error ? err.message : String(err)}`,
        true,
      );
    }
  });
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function showStatus(el: HTMLDivElement, text: string, isError: boolean) {
  el.textContent = text;
  el.className = isError ? 'status error' : 'status';
  el.classList.remove('hidden');
  setTimeout(() => {
    el.classList.add('hidden');
  }, 2000);
}
