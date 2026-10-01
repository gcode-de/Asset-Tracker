import User from "@/db/models/User";
import { decryptUserApiKey } from "@/lib/user-api-keys";

type ResolverDependencies = { decrypt?: typeof decryptUserApiKey };

/** Server-only: decrypt and deduplicate raw tokens; quota reads never rotate. */
export async function resolveAlphaVantageKeys(email: string, dependencies: ResolverDependencies & { advance?: boolean; findUser?: (filter: { email: string }) => Promise<any> } = {}): Promise<AlphaVantageKey[]> {
  const user = dependencies.advance
    ? await User.findOneAndUpdate({ email, "alphaVantageKeys.0": { $exists: true } }, { $inc: { alphaVantageKeyCursor: 1 } }, { new: false })
    : await (dependencies.findUser || ((filter) => User.findOne(filter).exec()))({ email });
  if (user?.alphaVantageKeys?.length) {
    const keys: AlphaVantageKey[] = user.alphaVantageKeys.map((item: { encryptedKey: string; maskedSuffix: string }) => ({ key: (dependencies.decrypt || decryptUserApiKey)(item.encryptedKey), identifier: `user:${item.maskedSuffix}` }));
    const seen = new Set<string>();
    const unique = keys.filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });
    const cursor = Math.max(0, Number(user.alphaVantageKeyCursor || 0)) % unique.length;
    return [...unique.slice(cursor), ...unique.slice(0, cursor)];
  }
  const key = process.env.ALPHAVANTAGE_KEY;
  if (!key) throw new Error("AlphaVantage API key not configured");
  return [{ key, identifier: "server" }];
}

export type AlphaVantageKey = { key: string; identifier: string };

export async function resolveAlphaVantageKey(email: string, dependencies: ResolverDependencies = {}): Promise<AlphaVantageKey> {
  return (await resolveAlphaVantageKeys(email, { ...dependencies, advance: true }))[0];
}
