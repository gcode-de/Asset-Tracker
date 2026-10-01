import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, dbConnect, findOne, findOneAndUpdate } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  dbConnect: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession }));
vi.mock("@/db/connect", () => ({ default: dbConnect }));
vi.mock("@/db/models/User", () => ({ default: { findOne, findOneAndUpdate } }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import handler from "@/pages/api/user/alpha-vantage-keys";

function response() {
  const result = { statusCode: 0, body: undefined as unknown, setHeader: vi.fn(), status: vi.fn() };
  result.status.mockImplementation((statusCode: number) => {
    result.statusCode = statusCode;
    return { json: (body: unknown) => { result.body = body; return result; }, end: vi.fn() };
  });
  return result;
}

describe("/api/user/alpha-vantage-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USER_API_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    getServerSession.mockResolvedValue({ user: { email: "user@example.com" } });
  });

  it("lists metadata without exposing encrypted or raw API keys", async () => {
    findOne.mockResolvedValue({
      alphaVantageKeys: [{ _id: "key-1", encryptedKey: "ciphertext", maskedSuffix: "••••abcd", createdAt: new Date("2026-09-30T00:00:00.000Z") }],
    });
    const res = response();

    await handler({ method: "GET" } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ keys: [{ id: "key-1", maskedSuffix: "••••abcd", createdAt: "2026-09-30T00:00:00.000Z" }] });
    expect(JSON.stringify(res.body)).not.toContain("ciphertext");
  });

  it.each([
    [undefined, "ENCRYPTION_KEY_MISSING"],
    ["short", "ENCRYPTION_KEY_INVALID"],
  ])("reports safe configuration diagnostics for %s", async (secret, code) => {
    if (secret === undefined) delete process.env.USER_API_TOKEN_ENCRYPTION_KEY;
    else process.env.USER_API_TOKEN_ENCRYPTION_KEY = secret;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = response();
    await handler({ method: "POST", body: { apiKey: "private-provider-token" } } as any, res as any);
    expect(log).toHaveBeenCalledWith("[private-key-storage]", expect.objectContaining({ encryptionKeyPresent: secret !== undefined }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-provider-token");
    log.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(expect.objectContaining({ code }));
    expect(JSON.stringify(res.body)).not.toContain("private-provider-token");
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("adds an encrypted key and returns only metadata", async () => {
    findOneAndUpdate.mockResolvedValue({
      alphaVantageKeys: [{ _id: "key-1", encryptedKey: "ciphertext", maskedSuffix: "••••abcd", createdAt: new Date("2026-09-30T00:00:00.000Z") }],
    });
    const res = response();

    await handler({ method: "POST", body: { apiKey: "alpha-vantage-secret-abcd" } } as any, res as any);

    expect(res.statusCode).toBe(201);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { email: "user@example.com", "alphaVantageKeys.2": { $exists: false } },
      expect.objectContaining({ $push: { alphaVantageKeys: expect.objectContaining({ maskedSuffix: "••••abcd" }) } }),
      expect.anything(),
    );
    expect(JSON.stringify(findOneAndUpdate.mock.calls[0][1])).not.toContain("alpha-vantage-secret-abcd");
    expect(res.body).toEqual({ key: { id: "key-1", maskedSuffix: "••••abcd", createdAt: "2026-09-30T00:00:00.000Z" } });
  });
});
