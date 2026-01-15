import crypto from "node:crypto";

/** ID stable-ish à partir d'une string */
export function safeId(seed: string): string {
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 12);
}
