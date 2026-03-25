/**
 * In-memory rate limiter for the admin login endpoint.
 *
 * Tracks failed login attempts per IP address.
 * After MAX_FAILURES within WINDOW_MS the IP is blocked until the window resets.
 *
 * Note: in-memory state is per serverless instance. On Vercel this is still
 * effective — each instance enforces its own limit — but for absolute certainty
 * swap the Map for an Upstash Redis store later if needed.
 */

const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

interface Entry {
  failures: number
  windowStart: number
}

const store = new Map<string, Entry>()

/** Extract the real client IP from a Next.js Request. */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

/**
 * Check whether the IP is allowed to attempt a login.
 * Returns { allowed: true } or { allowed: false, retryAfterSeconds: number }.
 */
export function checkLoginAllowed(ip: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // First attempt or window has expired — fresh start
    store.set(ip, { failures: 0, windowStart: now })
    return { allowed: true }
  }

  if (entry.failures >= MAX_FAILURES) {
    const retryAfterSeconds = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)
    return { allowed: false, retryAfterSeconds }
  }

  return { allowed: true }
}

/** Record a failed login attempt for this IP. */
export function recordFailure(ip: string): void {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(ip, { failures: 1, windowStart: now })
  } else {
    entry.failures++
  }
}

/** Clear the failure counter for this IP (called on successful login). */
export function clearFailures(ip: string): void {
  store.delete(ip)
}
