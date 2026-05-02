export interface ProjectConfig {
  id: string;
  label: string;
  hostname: string;
  endpoint: string;
}

export const PROJECTS: ProjectConfig[] = [
  {
    id: 'iddofroom',
    label: 'iddofroom',
    hostname: 'iddofroom.co.il',
    endpoint: 'https://iddofroom.co.il/api/qa-assistant',
  },
  {
    id: 'bakbukim',
    label: 'bakbukim',
    hostname: 'www.bakbookim.co.il',
    endpoint: 'https://www.bakbookim.co.il/api/qa-assistant',
  },
  {
    id: 'cleen-mm',
    label: 'cleen-mm',
    hostname: 'mm-clean.co.il',
    endpoint: 'https://mm-clean.co.il/api/qa-assistant',
  },
  {
    id: 'alon-ice',
    label: 'alon-ice',
    hostname: 'alon-ice.netlify.app',
    endpoint: 'https://alon-ice.netlify.app/api/qa-assistant',
  },
  {
    id: 'kibbuz-gallery',
    label: 'Kibbuz Gallery',
    hostname: 'kibbuz-gallery.co.il',
    endpoint: 'https://kibbuz-gallery.co.il/api/qa-assistant',
  },
  {
    id: 'meeting-copilot',
    label: 'meeting-copilot',
    hostname: 'meeting-copilot-13941.netlify.app',
    endpoint: 'https://meeting-copilot-13941.netlify.app/api/qa-assistant',
  },
  {
    id: 'rotem',
    label: 'rotem',
    hostname: 'rotembonder.netlify.app',
    endpoint: 'https://rotembonder.netlify.app/api/qa-assistant',
  },
  {
    id: 'solbot',
    label: 'solbot',
    hostname: 'solbot.co.il',
    endpoint: 'https://solbot.co.il/api/qa-assistant',
  },
  {
    id: 'todo-list',
    label: 'todo-list',
    hostname: 'iddofroom-todo-list.netlify.app',
    endpoint: 'https://iddofroom-todo-list.netlify.app/api/qa-assistant',
  },
  {
    id: 'trip-budget',
    label: 'Trip Budget',
    hostname: 'tripbudget.netlify.app',
    endpoint: 'https://tripbudget.netlify.app/api/qa-assistant',
  },
];

export function projectFromUrl(rawUrl: string | undefined): ProjectConfig | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  return PROJECTS.find((p) => p.hostname.toLowerCase() === host) ?? null;
}

export function isLocalhost(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function getProjectById(id: string | undefined): ProjectConfig | null {
  if (!id) return null;
  return PROJECTS.find((p) => p.id === id) ?? null;
}
