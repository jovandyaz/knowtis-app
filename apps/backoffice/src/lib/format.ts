/** Formats a USD amount to 4 decimals, since per-request AI costs are routinely sub-cent. */
export function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}
