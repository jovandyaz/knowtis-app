const CHUNK_RELOAD_KEY = 'chunk-reload';
const DEBOUNCE_MS = 10_000;

const CHUNK_ERROR_PATTERNS = [
  'is not a valid JavaScript MIME type',
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Loading chunk',
  'ChunkLoadError',
];

export function isChunkLoadError(error: Error): boolean {
  const message = error.message || '';
  return CHUNK_ERROR_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

export function shouldReloadForStaleChunk(): boolean {
  const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY);
  return !lastReload || Date.now() - Number(lastReload) > DEBOUNCE_MS;
}

export function reloadIfStaleChunk(): boolean {
  if (shouldReloadForStaleChunk()) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
    return true;
  }
  return false;
}
