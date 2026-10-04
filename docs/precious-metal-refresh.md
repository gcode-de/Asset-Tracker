# Precious-metal price refresh

## Provider contract (checked 2026-10-04)

Alpha Vantage documents `GOLD_SILVER_SPOT`, not `GLOBAL_QUOTE`, for live gold/silver spot quotes. Its accepted provider symbols are `XAU` / `GOLD` and `XAG` / `SILVER`. The documented public silver demo returned this flat JSON (an observed response, not a test fixture):

```json
{
  "nominal": "XAGUSD",
  "timestamp": "2026-10-04 19:56:11",
  "price": "60.3876771722"
}
```

The response denotes USD through `nominal`; it has no explicit `currency` or `unit` field. The provider documentation also does **not** explicitly state a weight unit. The app uses the conventional XAU/USD and XAG/USD spot denomination, USD per troy ounce, then converts to EUR per troy ounce. OANDA's first-party XAU/USD instrument explanation corroborates troy ounces quoted against USD; this is denomination evidence, not an additional Alpha Vantage schema field or an independently verified Alpha Vantage unit guarantee.

Public `apikey=demo` requests for `symbol=XAU` and `symbol=GOLD` returned the provider's demo-key restriction notice, not gold price data. Gold tests therefore use clearly labelled synthetic fixtures matching the observed silver response structure. No private/user API key was read or used during verification. The docs link to a free-key signup and do not mark this spot endpoint premium-only, but actual account entitlement cannot be established from the restricted demo.

## Application behavior

- Eligible types: `metals`, `metal`, `precious_metal` (case-insensitive).
- Gold symbols: `XAUUSD`, `XAU`; silver symbols: `XAGUSD`, `XAG` (case-insensitive, exact aliases only; no repairing whitespace, slashes or other suffixes). Although the provider accepts `GOLD`/`SILVER`, the app deliberately does not enable these English metal aliases: `GOLD` is also an equity ticker and the existing cache is symbol-only. Reserving ISO metal identities for metal holdings avoids cross-instrument cache pollution without rewriting user pair symbols or introducing a broad cache migration.
- Only the **outbound provider request** is mapped to `XAU` / `XAG`. `XAUUSD` / `XAGUSD` stay unchanged in holdings, UI requests, refresh results and price-cache identities.
- USD metal pairs incorrectly typed as stocks/crypto are rejected rather than sent to equity or currency endpoints. Ordinary stock/ETF/fund/crypto paths remain unchanged, including the equity ticker `GOLD` when typed as a stock.
- Platinum, palladium, unknown metals, cash, property and deleted holdings remain unsupported. The API requires an eligible, non-deleted holding owned by the authenticated user with the requested symbol; owning `XAUUSD` does not authorize an `XAU` cache update.
- The response must have the expected USD nominal, a nonempty timestamp, and a numeric string/number price. Finite positive spot and converted EUR prices are required before any price-cache write. Missing/mismatched schema or provider errors leave the previous price intact.
- Prices are cached as `currency: "EUR"`, `source: "alphavantage"`, `unit: "troy_ounce"`; quote timestamp remains the existing app refresh timestamp (no undocumented timezone inference from the provider's timestamp).
- Single-card icons and both batch controls use the same symbol-aware eligibility rule. Existing synchronous in-flight locks, serial batch requests, persistent two-second provider pacing, quota reservation, provider cooldowns and private-key handling remain in place.
- A spot quote uses one provider attempt. An uncached USD/EUR conversion uses a second attempt; the existing persistent one-hour FX cache avoids that second attempt on a cache hit. Failures retain actual consumed-attempt accounting.

## Quantity convention and migration limitation

The holdings schema and existing form have no gram/ounce field: valuation is `quantity * baseValue`. The bundled gold demo has quantity `2.5` and unit price `3020`, consistent with ounces, but this cannot establish the units of privately stored user holdings. Supported metal cards/forms now explicitly label quantities in **troy ounces** and prices in **EUR per troy ounce**. The form warns that grams are not accepted for this quote convention and existing quantities are not converted automatically.

**Check any holding previously entered in grams before refreshing it.** No existing quantities are migrated, silently divided/multiplied, or overwritten by this change. Coins/bars require their contained troy-ounce quantity, not merely their count. Physical-bullion premiums, purity adjustments and retail buy/sell spreads are not part of the spot quote.

## Verification scope

Tests cover exact eligibility/aliases, retained symbols, both UI batch controls and individual icons, the real Mongoose unit schema, cache-read unit projection, official-shaped gold/silver fixtures, malformed/invalid quotes, no writes on failure, stock/crypto regression behavior, and actual route-to-provider attempt counts with/without cached FX under injected time. Unit/schema tests and each new implementation slice were run RED then GREEN. No live account, real database, private provider entitlement, or actual gold quote was exercised.

## Sources

- Alpha Vantage API documentation, Gold & Silver Spot Prices: https://www.alphavantage.co/documentation/#gold-silver-spot
- Official public silver spot demo: https://www.alphavantage.co/query?function=GOLD_SILVER_SPOT&symbol=SILVER&apikey=demo
- Alpha Vantage MCP tool catalog: https://mcp.alphavantage.co/
- OANDA first-party XAU/USD denomination explanation: https://www.oanda.com/uk-en/trading/instruments/xau-usd/
