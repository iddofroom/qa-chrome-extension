// Single source of truth for what the extension persists. Everything goes
// through chrome.storage.local — nothing is hard-coded in source after the
// security overhaul.

export const STORAGE_API_SECRET = 'qa.apiSecret';
export const STORAGE_PROJECTS = 'qa.projects';

export interface QaProject {
  id: string;       // stable id; uuid generated client-side
  label: string;    // free-form display name (e.g. "iddofroom")
  origin: string;   // Chrome match pattern, e.g. "https://example.com/*"
  endpoint: string; // full URL the POST goes to
}

export async function getProjects(): Promise<QaProject[]> {
  const stored = await chrome.storage.local.get(STORAGE_PROJECTS);
  const list = stored[STORAGE_PROJECTS];
  return Array.isArray(list)
    ? (list as unknown[]).filter(isValidProject) as QaProject[]
    : [];
}

export async function setProjects(projects: QaProject[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_PROJECTS]: projects });
}

export async function getApiSecret(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_API_SECRET);
  return (stored[STORAGE_API_SECRET] as string | undefined) ?? '';
}

export async function setApiSecret(secret: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_API_SECRET]: secret });
}

function isValidProject(p: unknown): p is QaProject {
  return (
    !!p &&
    typeof p === 'object' &&
    typeof (p as QaProject).id === 'string' &&
    typeof (p as QaProject).origin === 'string' &&
    typeof (p as QaProject).endpoint === 'string' &&
    typeof (p as QaProject).label === 'string'
  );
}
