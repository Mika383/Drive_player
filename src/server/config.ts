import { isAbsolute, relative, resolve } from "node:path";
import { readFileSync, realpathSync } from "node:fs";

const repositoryRoot = resolve(process.cwd());

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function appOrigin(): string {
  const url = new URL(required("APP_BASE_URL"));
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("APP_BASE_URL must be an origin");
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("APP_BASE_URL must use HTTPS except on localhost");
  }
  return url.origin;
}

export function googleConfig() {
  return { clientId: required("GOOGLE_CLIENT_ID"), clientSecret: required("GOOGLE_CLIENT_SECRET") };
}

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

export function encryptionKey(): Buffer {
  const key = Buffer.from(required("TOKEN_ENCRYPTION_KEY_V1"), "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY_V1 must contain 32 base64-encoded bytes");
  return key;
}

export function serviceAccount() {
  const path = required("GOOGLE_SERVICE_ACCOUNT_KEY_FILE");
  if (!isAbsolute(path)) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_FILE must be absolute");
  const canonical = realpathSync(path);
  const inside = relative(repositoryRoot, canonical);
  if (!inside.startsWith("..") && !isAbsolute(inside)) {
    throw new Error("Store the service account key outside this repository");
  }
  const parsed: unknown = JSON.parse(readFileSync(canonical, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("client_email" in parsed) || typeof parsed.client_email !== "string") {
    throw new Error("Service account file has no client_email");
  }
  return { path: canonical, email: parsed.client_email };
}
