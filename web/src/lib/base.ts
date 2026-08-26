/**
 * The sub-path this build is served under.
 * "" when KareMa owns the whole domain, "/KareMa" when it is mounted under one.
 * Baked in at build time by vite's `base` option (see vite.config.ts).
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/**
 * Prefix a server-absolute path with the sub-path.
 * Leaves full URLs, colours and gradients alone, so it is safe to wrap
 * anything that *might* be a path — a card cover, an avatar, an attachment.
 */
export function withBase<T extends string | null | undefined>(path: T): T {
  if (!BASE || !path || !path.startsWith('/')) return path;
  if (path === BASE || path.startsWith(`${BASE}/`)) return path;
  return `${BASE}${path}` as T;
}
