export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
