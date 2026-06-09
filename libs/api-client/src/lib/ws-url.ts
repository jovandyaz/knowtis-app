/**
 * Derives the WebSocket-capable base URL from an HTTP API URL by stripping a
 * trailing `/api` or `/api/vN` segment plus any trailing slashes. Anchored to
 * the end of the URL so hosts or mid-path segments containing "api" are never
 * corrupted.
 */
export function deriveWsBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/api(?:\/v\d+)?\/?$/, '').replace(/\/+$/, '');
}
