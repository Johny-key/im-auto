// Shared auth utilities for admin API routes

// ── Rate limiter ────────────────────────────────────────────
// Track failed attempts per IP: { ip -> { count, resetAt } }
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000;   // 5 min window
const BLOCK_MS  = 15 * 60 * 1000;  // 15 min block after max attempts

function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function checkAuth(req: Request): "ok" | "unauthorized" | "rate_limited" {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return "unauthorized";

  const ip = getIp(req);
  const now = Date.now();
  const record = failedAttempts.get(ip);

  if (record) {
    if (now < record.resetAt && record.count >= MAX_ATTEMPTS) {
      return "rate_limited";
    }
    if (now >= record.resetAt) {
      failedAttempts.delete(ip);
    }
  }

  const token = req.headers.get("authorization");
  if (token !== `Bearer ${pw}`) {
    const current = failedAttempts.get(ip) ?? { count: 0, resetAt: now + WINDOW_MS };
    current.count += 1;
    if (current.count >= MAX_ATTEMPTS) current.resetAt = now + BLOCK_MS;
    failedAttempts.set(ip, current);
    return "unauthorized";
  }

  failedAttempts.delete(ip);
  return "ok";
}

export function authResponse(result: "unauthorized" | "rate_limited"): Response {
  if (result === "rate_limited") {
    return Response.json(
      { error: "Слишком много попыток. Попробуйте через 15 минут." },
      { status: 429 }
    );
  }
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// ── Password sanitizer ──────────────────────────────────────
const SAFE_PW = /^[\x20-\x7E]{4,100}$/; // printable ASCII, 4–100 chars, no newlines

export function sanitizePassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\r\n\t]/g, "").trim();
  if (!SAFE_PW.test(cleaned)) return null;
  return cleaned;
}

// ── Works field sanitizer ───────────────────────────────────
const STRIP_TAGS = /<[^>]*>/g;

export function sanitizeWork(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;

  const str = (v: unknown, max = 200) =>
    typeof v === "string" ? v.replace(STRIP_TAGS, "").slice(0, max).trim() : "";

  const year = Number(w.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;

  const photos = Array.isArray(w.photos)
    ? (w.photos as unknown[])
        .filter((p): p is string => typeof p === "string" && p.startsWith("/works/"))
        .slice(0, 30)
    : [];

  return {
    brand:    str(w.brand),
    model:    str(w.model),
    year,
    mileage:  str(w.mileage, 50),
    price:    str(w.price, 50),
    country:  str(w.country, 50),
    category: str(w.category, 50),
    specs:    str(w.specs, 500),
    photos,
  };
}
