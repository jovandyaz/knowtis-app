import { safeSessionStorage } from '@knowtis/shared-util';

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
  const lastReload = safeSessionStorage.getItem(CHUNK_RELOAD_KEY);
  return !lastReload || Date.now() - Number(lastReload) > DEBOUNCE_MS;
}

function rememberReload(): boolean {
  const stamp = String(Date.now());
  safeSessionStorage.setItem(CHUNK_RELOAD_KEY, stamp);
  return safeSessionStorage.getItem(CHUNK_RELOAD_KEY) === stamp;
}

export function reloadIfStaleChunk(): boolean {
  if (shouldReloadForStaleChunk() && rememberReload()) {
    window.location.reload();
    return true;
  }
  return false;
}
