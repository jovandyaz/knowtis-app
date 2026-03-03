export function parseTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload: unknown = JSON.parse(atob(parts[1]));

    if (
      typeof payload === 'object' &&
      payload !== null &&
      'exp' in payload &&
      typeof (payload as Record<string, unknown>)['exp'] === 'number'
    ) {
      return (payload as Record<string, number>)['exp'] * 1000;
    }

    return null;
  } catch {
    return null;
  }
}
