// Demo-scale in-memory token blacklist. In production this should live in Redis.

const DEFAULT_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

const blacklistedTokens = new Set<string>();
const blacklistExpiries = new Map<string, number>();

export function addToBlacklist(jti: string, expiresAtMs = Date.now() + DEFAULT_TOKEN_TTL_MS): void {
  blacklistedTokens.add(jti);
  blacklistExpiries.set(jti, expiresAtMs);
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

  for (const [jti, expiresAt] of blacklistExpiries.entries()) {
    if (expiresAt <= now) {
      blacklistedTokens.delete(jti);
      blacklistExpiries.delete(jti);
    }
  }
}

const cleanupTimer = setInterval(cleanupExpiredEntries, 60 * 60 * 1000);
cleanupTimer.unref();
