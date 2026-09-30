import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey(secret: string): Buffer {
  if (!secret) throw new Error("USER_API_TOKEN_ENCRYPTION_KEY must be configured");

  const hexKey = /^[a-fA-F0-9]{64}$/.test(secret) ? Buffer.from(secret, "hex") : Buffer.from(secret, "base64");
  if (hexKey.length !== 32) {
    throw new Error("USER_API_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value or 64-character hex value");
  }
  return hexKey;
}

export function encryptUserApiKey(rawKey: string, secret = process.env.USER_API_TOKEN_ENCRYPTION_KEY): string {
  if (!rawKey?.trim()) throw new Error("Alpha Vantage API key is required");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(secret || ""), iv);
  const ciphertext = Buffer.concat([cipher.update(rawKey.trim(), "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${ciphertext.toString("base64")}:${cipher.getAuthTag().toString("base64")}`;
}

export function decryptUserApiKey(payload: string, secret = process.env.USER_API_TOKEN_ENCRYPTION_KEY): string {
  const [iv, ciphertext, authTag, ...extra] = payload.split(":");
  if (!iv || !ciphertext || !authTag || extra.length) throw new Error("Encrypted Alpha Vantage API key is invalid");

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(secret || ""), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.includes("USER_API_TOKEN_ENCRYPTION_KEY")) throw error;
    throw new Error("Encrypted Alpha Vantage API key is invalid");
  }
}

export function maskUserApiKey(rawKey: string): string {
  return `••••${rawKey.slice(-4)}`;
}
