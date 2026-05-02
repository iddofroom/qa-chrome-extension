// Chrome extension match-pattern utilities. Spec:
// https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
//
// We only need a subset:
//   <all_urls> — matches any URL with a supported scheme.
//   <scheme>://<host>/<path> — scheme is http|https|*; host can be exact,
//   *.example.com, or *; path starts with / and may contain wildcards.

// Make a user-typed pattern strictly conform to Chrome's match-pattern spec.
// "https://example.com"   → "https://example.com/*"
// "https://example.com/"  → "https://example.com/*"
// "https://example.com/admin/" → "https://example.com/admin/*"
// "https://example.com/*" → unchanged.
// We're forgiving about a missing `/*` at the end because most users (and
// most URL fields) don't think to add it; without it the regex below would
// only match the bare root URL.
export function normalizePattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (trimmed === '<all_urls>') return trimmed;
  const sepIdx = trimmed.indexOf('://');
  if (sepIdx === -1) return trimmed;
  const scheme = trimmed.slice(0, sepIdx);
  const rest = trimmed.slice(sepIdx + 3);
  if (!rest) return trimmed;
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return `${scheme}://${rest}/*`;
  const host = rest.slice(0, slashIdx);
  let path = rest.slice(slashIdx);
  if (path === '/') path = '/*';
  else if (path.endsWith('/')) path = `${path}*`;
  return `${scheme}://${host}${path}`;
}

export function isValidMatchPattern(pattern: string): boolean {
  const p = normalizePattern(pattern);
  if (p === '<all_urls>') return true;
  const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(p);
  if (!m) return false;
  const [, , host, path] = m;
  if (host === '') return false;
  if (host !== '*' && !/^(\*\.)?[a-z0-9.\-:]+$/i.test(host)) return false;
  if (!path.startsWith('/')) return false;
  return true;
}

// Build a regex that tests a URL against a match pattern. Accepts either a
// strictly-conforming pattern or the lenient forms normalizePattern handles
// — so old patterns saved before normalization existed still match.
export function matchPatternToRegex(pattern: string): RegExp {
  const p = normalizePattern(pattern);
  if (p === '<all_urls>') {
    return /^https?:\/\/.+/i;
  }
  const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(p);
  if (!m) throw new Error(`Invalid match pattern: ${pattern}`);
  const [, scheme, host, path] = m;

  const schemeRe = scheme === '*' ? 'https?' : scheme;

  let hostRe: string;
  if (host === '*') {
    hostRe = '[^/]+';
  } else if (host.startsWith('*.')) {
    const suffix = host.slice(2).replace(/\./g, '\\.');
    hostRe = `(?:[^/]+\\.)?${suffix}`;
  } else {
    hostRe = host.replace(/\./g, '\\.');
  }

  // Escape regex specials in path, then convert * → .* (match-pattern wildcard).
  const pathRe = path
    .replace(/[\\.+?(){}|[\]^$]/g, '\\$&')
    .replace(/\*/g, '.*');

  return new RegExp(`^${schemeRe}:\\/\\/${hostRe}${pathRe}$`, 'i');
}

export function matchUrl(pattern: string, url: string): boolean {
  try {
    return matchPatternToRegex(pattern).test(url);
  } catch {
    return false;
  }
}

// Chrome accepts only specific schemes for fetchable endpoints in this
// extension. Localhost gets an explicit exemption (HTTP allowed there).
export function isAllowedEndpoint(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') {
    return (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '[::1]'
    );
  }
  return false;
}

// Convert any URL into the canonical "<scheme>://<host>/*" pattern that
// chrome.permissions.request expects.
export function urlToOriginPattern(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}
