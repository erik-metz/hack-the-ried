const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_ENTRIES = 10_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function prune(now: number) {
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
  while (attempts.size >= MAX_ENTRIES) {
    const oldest = attempts.keys().next().value;
    if (!oldest) break;
    attempts.delete(oldest);
  }
}

export function loginAllowed(identifier: string): boolean {
  const now = Date.now();
  prune(now);
  const entry = attempts.get(identifier);
  return !entry || entry.count < MAX_FAILURES;
}

export function recordFailedLogin(identifier: string) {
  const now = Date.now();
  prune(now);
  const entry = attempts.get(identifier);
  attempts.set(identifier, {
    count: (entry?.count ?? 0) + 1,
    resetAt: entry?.resetAt ?? now + WINDOW_MS,
  });
}

export function clearFailedLogins(identifier: string) {
  attempts.delete(identifier);
}
