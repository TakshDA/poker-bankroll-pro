/**
 * Simple in-memory sliding-window limiter for login attempts. It protects a
 * single server process; multi-instance deployments should rely on the auth
 * provider's own limits (Supabase Auth has them built in).
 */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

export function isRateLimited(key: string, now = Date.now()): boolean {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list.length >= MAX_FAILURES;
}

export function recordFailure(key: string, now = Date.now()) {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  failures.set(key, list);
}

export function clearFailures(key: string) {
  failures.delete(key);
}
