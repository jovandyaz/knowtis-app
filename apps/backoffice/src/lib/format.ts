/** Formats a USD amount to 4 decimals, since per-request AI costs are routinely sub-cent. */
export function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

const TOKENS_PER_MILLION = 1_000_000;
const PRICE_PER_MILLION_DECIMALS = 2;

/** Formats a per-token price as dollars per million tokens, the unit model pricing is quoted in. */
export function formatUsdPerMillionTokens(costPerToken: number): string {
  return `$${(costPerToken * TOKENS_PER_MILLION).toFixed(PRICE_PER_MILLION_DECIMALS)}`;
}
