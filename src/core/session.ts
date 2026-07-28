import { randomBytes, createHash } from "node:crypto";

const DUREE_SESSION_JOURS = 30;

/** Jeton opaque à usage unique (30 octets → 40 caractères en base64url). */
export function genererJeton(): string {
  return randomBytes(30).toString("base64url");
}

/** Seul le hash est stocké en base — jamais le jeton en clair (plan §11.1). */
export function hasherJeton(jetonBrut: string): string {
  return createHash("sha256").update(jetonBrut).digest("hex");
}

export function expirationSession(): Date {
  const expire = new Date();
  expire.setUTCDate(expire.getUTCDate() + DUREE_SESSION_JOURS);
  return expire;
}
