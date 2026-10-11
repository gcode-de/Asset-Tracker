// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
const mocks = vi.hoisted(() => ({ findOne: vi.fn(), save: vi.fn(), markModified: vi.fn() }));
vi.mock("@/db/connect", () => ({ default: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: async () => ({ user: { email: "test@example.com" } }) }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/db/models/User", () => ({ default: { findOne: mocks.findOne } }));
import handler from "@/pages/api/user";
beforeEach(() => vi.clearAllMocks());
it.each([undefined, null, "", 0, 100])("persists cost basis %s without converting missing to zero", async basis => {
  const user = { assets: [] as Array<{ costBasis: number | null }>, save: mocks.save, markModified: mocks.markModified };
  mocks.findOne.mockResolvedValue(user);
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ method: "POST", query: {}, body: { name: "Holding", costBasis: basis } } as unknown as NextApiRequest, response as unknown as NextApiResponse);
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(user.assets[0].costBasis).toBe(typeof basis === "number" ? basis : null);
  expect(response.status).toHaveBeenCalledWith(201);
  await handler({ method: "PUT", query: { action: "update" }, body: { id: (user.assets[0] as { id?: string | number }).id, costBasis: "" } } as unknown as NextApiRequest, response as unknown as NextApiResponse);
  expect(user.assets[0].costBasis).toBeNull();
  expect(mocks.save).toHaveBeenCalledTimes(2);
});
