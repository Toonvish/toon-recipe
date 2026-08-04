/**
 * OWNER: auth agent.
 *
 * Minting and hashing for the single-use secrets that travel in a mailed link
 * (password reset, e-mail confirmation).
 *
 * TWO RULES, both deliberate:
 *
 *  1. The token is 32 bytes of CSPRNG output, base64url — the same entropy as a
 *     session id, because a reset token is briefly worth exactly as much.
 *  2. Only its SHA-256 hash is stored. `group_invites` keeps the raw token and
 *     that is fine (a leaked invite costs group membership); a leaked reset table
 *     would cost every account, so this one is one-way. No salt and no argon2:
 *     the input is already 256 random bits, so there is nothing to grind, and a
 *     salted hash could not be looked up by token at all.
 */

/** 32 random bytes, URL-safe base64 (43 chars) — safe in a path segment. */
export function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** SHA-256 (hex) of a token — the only form that ever reaches the database. */
export function hashToken(token: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(token);
  return hasher.digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Lookups here go through a UNIQUE index on the hash, so there is no secret to
 * leak by timing in the happy path — this exists for the places that compare a
 * recomputed digest against one already in hand.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
