// Runs in MAIN world at document_start so it can wrap the page's real console
// before any page script runs. The buffered logs live on window.__qaConsoleBuffer
// and are read later by chrome.scripting.executeScript from the background worker.

declare global {
  interface Window {
    __qaConsoleBuffer?: QaLogEntry[];
    __qaConsoleInstalled?: boolean;
  }
}

interface QaLogEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  ts: number;
  args: string[];
}

const MAX_ENTRIES = 500;

(function installQaConsoleCapture() {
  if (window.__qaConsoleInstalled) return;
  window.__qaConsoleInstalled = true;
  window.__qaConsoleBuffer = [];

  const buffer = window.__qaConsoleBuffer;

  const safeStringify = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    const t = typeof value;
    if (t === 'string') return value as string;
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
    if (value instanceof Error) {
      return `${value.name}: ${value.message}${value.stack ? '\n' + value.stack : ''}`;
    }
    try {
      const seen = new WeakSet<object>();
      return JSON.stringify(value, (_k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        if (typeof v === 'bigint') return v.toString() + 'n';
        if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
        return v;
      });
    } catch {
      try {
        return Object.prototype.toString.call(value);
      } catch {
        return '[Unserializable]';
      }
    }
  };

  const wrap = (level: QaLogEntry['level']) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        buffer.push({
          level,
          ts: Date.now(),
          args: args.map(safeStringify),
        });
        if (buffer.length > MAX_ENTRIES) {
          buffer.splice(0, buffer.length - MAX_ENTRIES);
        }
      } catch {
        // Never let logging instrumentation break the page.
      }
      return original(...args);
    };
  };

  wrap('log');
  wrap('info');
  wrap('warn');
  wrap('error');

  // Also capture uncaught errors and unhandled rejections — usually the
  // most useful signal during QA.
  window.addEventListener('error', (event) => {
    try {
      buffer.push({
        level: 'error',
        ts: Date.now(),
        args: [
          `[uncaught] ${event.message}`,
          event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : '',
          event.error?.stack ?? '',
        ].filter(Boolean),
      });
    } catch {
      /* ignore */
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      buffer.push({
        level: 'error',
        ts: Date.now(),
        args: [
          '[unhandledrejection]',
          reason instanceof Error ? `${reason.name}: ${reason.message}\n${reason.stack ?? ''}` : safeStringify(reason),
        ],
      });
    } catch {
      /* ignore */
    }
  });
})();

export {};
