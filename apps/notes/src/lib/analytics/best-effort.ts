export function runAnalyticsSafely(operation: () => void): boolean {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
}
