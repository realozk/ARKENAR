/**
 * logger.ts — Minimal structured logger for Arkenar.
 *
 * Rules:
 *  - In dev builds (`import.meta.env.DEV === true`): all levels are visible.
 *  - In prod builds: `info` and `warn` are gated behind `window.__ARKENAR_DEBUG__`.
 *  - `error` is always surfaced regardless of environment, so real failures are
 *    never silently swallowed.
 *
 * Usage:
 *   import { log } from '../utils/logger';
 *   log.info('Found update', version);
 *   log.warn('Retrying request', url);
 *   log.error('Failed to open dialog', err);
 *
 * To enable verbose output in a production build open DevTools and run:
 *   window.__ARKENAR_DEBUG__ = true
 */

const isDev = import.meta.env?.DEV === true;

function debugEnabled(): boolean {
  try {
    return Boolean(
      (globalThis as unknown as { __ARKENAR_DEBUG__?: boolean }).__ARKENAR_DEBUG__
    );
  } catch {
    return false;
  }
}

export const log = {
  /** Informational message — suppressed in production unless `__ARKENAR_DEBUG__` is set. */
  info:  (...args: unknown[]): void => {
    if (isDev || debugEnabled()) console.log(...args);
  },
  /** Warning — suppressed in production unless `__ARKENAR_DEBUG__` is set. */
  warn:  (...args: unknown[]): void => {
    if (isDev || debugEnabled()) console.warn(...args);
  },
  /** Error — always surfaced; never suppressed. */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
