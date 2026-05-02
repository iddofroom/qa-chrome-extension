const STORAGE_API_SECRET = 'qa.apiSecret';

document.addEventListener('DOMContentLoaded', () => {
  void init();
});

async function init() {
  const input = document.getElementById('secret') as HTMLInputElement;
  const save = document.getElementById('save') as HTMLButtonElement;
  const toggle = document.getElementById('toggle') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;

  const stored = await chrome.storage.local.get(STORAGE_API_SECRET);
  input.value = (stored[STORAGE_API_SECRET] as string | undefined) ?? '';

  toggle.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  save.addEventListener('click', async () => {
    const value = input.value.trim();
    try {
      await chrome.storage.local.set({ [STORAGE_API_SECRET]: value });
      showStatus(status, value ? 'נשמר.' : 'נמחק.', false);
    } catch (err) {
      showStatus(status, `שגיאה: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  });
}

function showStatus(el: HTMLDivElement, text: string, isError: boolean) {
  el.textContent = text;
  el.className = isError ? 'status error' : 'status';
  setTimeout(() => {
    el.classList.add('hidden');
  }, 2000);
}
