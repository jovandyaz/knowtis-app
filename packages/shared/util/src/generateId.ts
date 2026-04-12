/**
 * Generate a UUID v4
 * @returns The generated ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}
