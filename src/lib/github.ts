// Minimal GitHub API client. We only call /user/repos with a user-supplied
// PAT (read-only metadata is enough). The PAT lives in chrome.storage.local
// and is sent only as Authorization to api.github.com — never echoed
// elsewhere in the extension.

const GITHUB_API_ORIGIN = 'https://api.github.com';
export const GITHUB_PERMISSION_ORIGIN = `${GITHUB_API_ORIGIN}/*`;

export interface GhRepo {
  name: string;
  full_name: string;
  html_url: string;
  homepage: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
}

// Returns repos owned by or accessible to the authenticated user. Filters
// out archived repos. Paginates until the API stops returning a full page.
export async function listUserRepos(pat: string): Promise<GhRepo[]> {
  if (!pat) throw new Error('GitHub PAT missing.');
  const out: GhRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = `${GITHUB_API_ORIGIN}/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const detail = text ? `: ${text.slice(0, 300)}` : '';
      throw new Error(`GitHub API ${res.status}${detail}`);
    }
    const batch = (await res.json()) as GhRepo[];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.filter((r) => !r.archived);
}

// Convert a repo's homepage field into a normalized URL. Returns null when
// the homepage is missing, blank, or unparsable.
export function homepageUrl(repo: GhRepo): URL | null {
  const raw = (repo.homepage ?? '').trim();
  if (!raw) return null;
  // Allow "example.com" without scheme — assume https.
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

// Convert a repo to the project shape the bulk-import textarea consumes.
// Returns null when there's no usable homepage URL.
export function repoToProjectDraft(
  repo: GhRepo,
  endpointPath: string,
): { label: string; origin: string; endpoint: string } | null {
  const u = homepageUrl(repo);
  if (!u) return null;
  const origin = `${u.protocol}//${u.host}`;
  return {
    label: repo.name,
    origin: `${origin}/*`,
    endpoint: `${origin}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`,
  };
}
