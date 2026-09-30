import { describe, expect, it } from "vitest";
import { decryptUserApiKey, encryptUserApiKey, maskUserApiKey } from "./user-api-keys";

describe("user API key encryption", () => {
  it("encrypts a key with AES-256-GCM and decrypts it only with the configured server secret", () => {
    const secret = "a".repeat(64);
    const rawKey = "alpha-vantage-private-key";

    const encrypted = encryptUserApiKey(rawKey, secret);

    expect(encrypted).not.toContain(rawKey);
    expect(encrypted.split(":")).toHaveLength(3);
    expect(decryptUserApiKey(encrypted, secret)).toBe(rawKey);
  });

  it("rejects missing or invalid encryption secrets", () => {
    expect(() => encryptUserApiKey("private-key", "")).toThrow("USER_API_TOKEN_ENCRYPTION_KEY");
    expect(() => encryptUserApiKey("private-key", "short")).toThrow("USER_API_TOKEN_ENCRYPTION_KEY");
  });

  it("returns only a non-sensitive suffix for display", () => {
    expect(maskUserApiKey("abcdefgh")).toBe("••••efgh");
  });
});
