import { AppError } from "./errors";

const counters = new Map<string, { count: number; resetAt: number }>();

// The approved first deployment has one long-running Node process. Add shared storage before scaling out.
export function rateLimit(key: string, maximum: number, windowMs: number): void {
  const now = Date.now();
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
  } else if (current.count >= maximum) {
    throw new AppError(429, "RATE_LIMITED", "Bạn thao tác quá nhanh. Hãy thử lại sau.");
  } else {
    current.count += 1;
  }
  if (counters.size > 10000) {
    for (const [name, value] of counters) if (value.resetAt <= now) counters.delete(name);
  }
}
