export function runAnalyticsSafely(operation: () => void): void {
  try {
    operation();
  } catch {
    return;
  }
}
