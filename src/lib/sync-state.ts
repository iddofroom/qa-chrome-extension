// Reconcile chrome.permissions and chrome.scripting state with the user's
// configured projects. Both functions are idempotent — call them after every
// save (with a user gesture) and on background startup (without a gesture,
// only the no-prompt operations).

import { isAllowedEndpoint, urlToOriginPattern } from './match-pattern';
import type { QaProject } from './storage';

const SCRIPT_ID_PREFIX = 'qa-console-capture-';

// crxjs hashes the content-script output (assets/console-capture.ts-XXXX.js).
// We can't hard-code that path, so we read it from the manifest at runtime —
// the static content_scripts entry exists only as a build hint exactly so
// this lookup works.
function contentScriptFile(): string | null {
  const m = chrome.runtime.getManifest();
  const cs = m.content_scripts?.[0];
  return cs?.js?.[0] ?? null;
}

export function projectOriginPatterns(projects: QaProject[]): string[] {
  // Origins we need granted: every project's tab pattern AND every endpoint
  // origin. Often these overlap (single-origin project), but the endpoint can
  // sit on a different host (self-hosted QA backend).
  const set = new Set<string>();
  for (const p of projects) {
    if (p.origin) set.add(p.origin);
    const ep = urlToOriginPattern(p.endpoint);
    if (ep) set.add(ep);
  }
  return [...set];
}

// Origins that Chrome considers "required" because they're declared
// statically in the manifest (host_permissions or content_scripts.matches).
// chrome.permissions.remove rejects with "You cannot remove required
// permissions" if any of these is in its argument, so we filter them out
// of the prune set.
function manifestRequiredOrigins(): Set<string> {
  const m = chrome.runtime.getManifest();
  const set = new Set<string>();
  for (const h of (m.host_permissions ?? []) as string[]) set.add(h);
  for (const cs of (m.content_scripts ?? []) as Array<{ matches?: string[] }>) {
    for (const match of cs.matches ?? []) set.add(match);
  }
  return set;
}

// Request newly-needed origins from the user (must be inside a user gesture
// like a click handler) and revoke any origin we no longer need. Throws if
// the user declines.
export async function requestAndPrunePermissions(
  desired: string[],
): Promise<{ requested: string[]; removed: string[] }> {
  const current = await chrome.permissions.getAll();
  const granted = new Set(current.origins ?? []);
  const required = manifestRequiredOrigins();

  const desiredSet = new Set(desired);
  const toRequest = desired.filter((o) => !granted.has(o));
  const toRemove = [...granted].filter(
    (o) => !desiredSet.has(o) && !required.has(o),
  );

  if (toRequest.length > 0) {
    const ok = await chrome.permissions.request({ origins: toRequest });
    if (!ok) {
      throw new Error(
        'הרשאה נדחתה. כדי שהתוסף יוכל לפעול על ' +
          toRequest.join(', ') +
          ' צריך לאשר.',
      );
    }
  }
  if (toRemove.length > 0) {
    try {
      await chrome.permissions.remove({ origins: toRemove });
    } catch (err) {
      // If a particular origin can't be removed (Chrome treats it as
      // required for some reason), log and continue — we've still saved
      // settings and granted the new ones.
      console.warn('[qa] permissions.remove partial failure', err, toRemove);
    }
  }
  return { requested: toRequest, removed: toRemove };
}

// (Re)register the console-capture content script with the projects' tab
// patterns. We register one script per project so the registration stays
// scoped — replacing the registration is just a matter of unregistering
// everything we own and re-registering. No user gesture needed.
export async function syncContentScripts(
  projects: QaProject[],
): Promise<void> {
  let existing: chrome.scripting.RegisteredContentScript[] = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts();
  } catch {
    // First call after install can throw on some Chrome builds. Treat as none.
  }
  const ourIds = existing
    .map((s) => s.id)
    .filter((id) => id.startsWith(SCRIPT_ID_PREFIX));
  if (ourIds.length > 0) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ourIds });
    } catch {
      // Best-effort.
    }
  }

  // Filter to projects whose origin we actually have permission for. Without
  // permission Chrome silently drops the registration; explicit filter keeps
  // the visible state consistent.
  const granted = await chrome.permissions.getAll();
  const grantedOrigins = new Set(granted.origins ?? []);
  const eligible = projects.filter(
    (p) => p.origin && grantedOrigins.has(p.origin),
  );
  if (eligible.length === 0) return;

  const file = contentScriptFile();
  if (!file) {
    console.error('[qa] content-script bundle path missing from manifest');
    return;
  }

  const registrations = eligible.map((p) => ({
    id: `${SCRIPT_ID_PREFIX}${p.id}`,
    matches: [p.origin],
    js: [file],
    runAt: 'document_start' as const,
    world: 'MAIN' as chrome.scripting.ExecutionWorld,
    persistAcrossSessions: true,
  }));
  try {
    await chrome.scripting.registerContentScripts(registrations);
  } catch (err) {
    // Surface in console for debugging but don't crash background.
    console.error('[qa] registerContentScripts failed', err);
  }
}

// Defense-in-depth: even if the popup somehow asks the background to fetch a
// non-https endpoint, the background re-validates here.
export function assertAllowedEndpoint(url: string): void {
  if (!isAllowedEndpoint(url)) {
    throw new Error(
      'Endpoint URL חייב להיות https:// (או http://localhost לפיתוח).',
    );
  }
}
