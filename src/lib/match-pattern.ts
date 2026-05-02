// Chrome extension match-pattern utilities. Spec:
// https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
//
// We only need a subset:
//   <all_urls> — matches any URL with a supported scheme.
//   <scheme>://<host>/<path> — scheme is http|https|*; host can be exact,
//   *.example.com, or *; path starts with / and may contain wildcards.

export function isValidMatchPattern(pattern: string): boolean {
  if (pattern === '<all_urls>') return true;
  const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!m) return false;
  const [, , host, path] = m;
  if (host === '') return false;
  if (host !== '*' && !/^(\*\.)?[a-z0-9.\-:]+$/i.test(host)) return false;
  if (!path.startsWith('/')) return false;
  return true;
}

// Build a regex that tests a URL against a match pattern.
export function matchPatternToRegex(pattern: string): RegExp {
  if (pattern === '<all_urls>') {
    return /^https?:\/\/.+/i;
  }
  const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(pattern);
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
