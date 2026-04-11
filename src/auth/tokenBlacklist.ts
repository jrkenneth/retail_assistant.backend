import fs from "node:fs";
import path from "node:path";

const DEFAULT_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

// Persist the blacklist to a local file so logouts survive server restarts.
// In a multi-instance production deployment this should move to Redis or a DB table.
const BLACKLIST_FILE = path.join(process.cwd(), ".token-blacklist.json");

const blacklistedTokens = new Set<string>();
const blacklistExpiries = new Map<string, number>();

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(BLACKLIST_FILE)) return;
    const raw = fs.readFileSync(BLACKLIST_FILE, "utf-8");
    const entries = JSON.parse(raw) as Array<{ jti: string; expiresAt: number }>;
    const now = Date.now();
    for (const { jti, expiresAt } of entries) {
      if (expiresAt > now) {
        blacklistedTokens.add(jti);
        blacklistExpiries.set(jti, expiresAt);
      }
    }
  } catch {
    // Non-fatal: start with an empty in-memory blacklist.
  }
}

function saveToDisk(): void {
  try {
    const entries = Array.from(blacklistExpiries.entries()).map(([jti, expiresAt]) => ({
      jti,
      expiresAt,
    }));
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(entries), "utf-8");
  } catch {
    // Non-fatal: in-memory blacklist still enforces logouts for this process lifetime.
  }
}

// Hydrate from disk on module load.
loadFromDisk();

export function addToBlacklist(jti: string, expiresAtMs = Date.now() + DEFAULT_TOKEN_TTL_MS): void {
  blacklistedTokens.add(jti);
  blacklistExpiries.set(jti, expiresAtMs);
  saveToDisk();
}

export function isBlacklisted(jti: string): boolean {
  const expiresAt = blacklistExpiries.get(jti);
  if (expiresAt !== undefined && expiresAt <= Date.now()) {
    blacklistedTokens.delete(jti);
    blacklistExpiries.delete(jti);
    return false;
  }

  return blacklistedTokens.has(jti);
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  let changed = false;

  for (const [jti, expiresAt] of blacklistExpiries.entries()) {
    if (expiresAt <= now) {
      blacklistedTokens.delete(jti);
      blacklistExpiries.delete(jti);
      changed = true;
    }
  }

  if (changed) {
    saveToDisk();
  }
}

const cleanupTimer = setInterval(cleanupExpiredEntries, 60 * 60 * 1000);
cleanupTimer.unref();
