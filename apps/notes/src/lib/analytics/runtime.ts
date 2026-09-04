let analyticsReady = false;
let identityCapturePaused = true;

export function setAnalyticsReady(ready: boolean): void {
  analyticsReady = ready;
}

export function isAnalyticsReady(): boolean {
  return analyticsReady;
}

export function pauseAnalyticsCapture(): void {
  identityCapturePaused = true;
}

export function resumeAnalyticsCapture(): void {
  identityCapturePaused = false;
}

export function canCaptureAnalytics(): boolean {
  return analyticsReady && !identityCapturePaused;
}
