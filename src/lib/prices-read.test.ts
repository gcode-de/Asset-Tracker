import { expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
const aggregate = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/db/connect", () => ({ default: vi.fn() }));
vi.mock("@/db/models/Price", () => ({ default: { aggregate } }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
import prices from "@/pages/api/prices";

it("includes cached metal units in the latest-price aggregation", async () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await prices({ method: "GET", query: {} } as NextApiRequest, res as unknown as NextApiResponse);
  expect(aggregate).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ $group: expect.objectContaining({ unit: { $first: "$unit" } }) }),
  ]));
});
