import User from "@/db/models/User";
import { decryptUserApiKey } from "@/lib/user-api-keys";

type ResolverDependencies = { decrypt?: typeof decryptUserApiKey };

export type AlphaVantageKey = { key: string; identifier: string };

export async function resolveAlphaVantageKey(email: string, dependencies: ResolverDependencies = {}): Promise<AlphaVantageKey> {
  const user = await User.findOneAndUpdate(
    { email, "alphaVantageKeys.0": { $exists: true } },
    { $inc: { alphaVantageKeyCursor: 1 } },
    { new: false },
  );

  if (user?.alphaVantageKeys?.length) {
    const cursor = Math.max(0, Number(user.alphaVantageKeyCursor || 0));
    const selected = user.alphaVantageKeys[cursor % user.alphaVantageKeys.length];
    const decrypt = dependencies.decrypt || decryptUserApiKey;
    return { key: decrypt(selected.encryptedKey), identifier: `user:${selected.maskedSuffix}` };
  }

  const key = process.env.ALPHAVANTAGE_KEY;
  if (!key) throw new Error("AlphaVantage API key not configured");
  return { key, identifier: "server" };
}
