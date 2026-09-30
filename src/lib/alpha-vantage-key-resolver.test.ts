import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOneAndUpdate } = vi.hoisted(() => ({ findOneAndUpdate: vi.fn() }));
vi.mock("@/db/models/User", () => ({ default: { findOneAndUpdate } }));

import { resolveAlphaVantageKey } from "./alpha-vantage-key-resolver";

describe("resolveAlphaVantageKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USER_API_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  });

  it("uses each saved key round-robin and advances the persistent cursor", async () => {
    findOneAndUpdate.mockResolvedValue({
      alphaVantageKeyCursor: 0,
      alphaVantageKeys: [
        { encryptedKey: "x", maskedSuffix: "••••1111", createdAt: new Date() },
        { encryptedKey: "y", maskedSuffix: "••••2222", createdAt: new Date() },
      ],
    });

    await expect(resolveAlphaVantageKey("user@example.com", { decrypt: vi.fn().mockReturnValue("first-key") })).resolves.toEqual({ key: "first-key", identifier: "user:••••1111" });
    expect(findOneAndUpdate).toHaveBeenCalledWith({ email: "user@example.com", "alphaVantageKeys.0": { $exists: true } }, { $inc: { alphaVantageKeyCursor: 1 } }, { new: false });
  });

  it("falls back only when the user has no saved key", async () => {
    findOneAndUpdate.mockResolvedValue(null);
    process.env.ALPHAVANTAGE_KEY = "server-key";

    await expect(resolveAlphaVantageKey("user@example.com")).resolves.toEqual({ key: "server-key", identifier: "server" });
  });
});
