import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { encryptionKey } from "./config";

export function hashSession(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function encryptRefreshToken(token: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { refreshCiphertext: ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion: 1 };
}

export function decryptRefreshToken(value: {
  refreshCiphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  keyVersion: number;
}): string {
  if (value.keyVersion !== 1) throw new Error("Unsupported token key version");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), value.nonce);
  decipher.setAuthTag(value.authTag);
  return Buffer.concat([decipher.update(value.refreshCiphertext), decipher.final()]).toString("utf8");
}
