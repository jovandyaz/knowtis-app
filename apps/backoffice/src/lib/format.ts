/** Formats a USD amount to 4 decimals, since per-request AI costs are routinely sub-cent. */
export function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

const TOKENS_PER_MILLION = 1_000_000;
const PRICE_PER_MILLION_MIN_DECIMALS = 2;
const PRICE_PER_MILLION_MAX_DECIMALS = 4;

const pricePerMillionFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: PRICE_PER_MILLION_MIN_DECIMALS,
  maximumFractionDigits: PRICE_PER_MILLION_MAX_DECIMALS,
});

/** Formats a per-token price as dollars per million tokens, the unit model pricing is quoted in. Decimals are a maximum, not a fixed width: a cheap open-weight model must never round to the same string as a free one. */
export function formatUsdPerMillionTokens(costPerToken: number): string {
  return pricePerMillionFormatter.format(costPerToken * TOKENS_PER_MILLION);
}
