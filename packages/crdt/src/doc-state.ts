import * as Y from 'yjs';

const BASE64_CHUNK_BYTES = 0x8000;

/**
 * Encodes the doc's full CRDT state as a base64 update, suitable for
 * persisting through JSON transports. Applying it to an empty doc rebuilds
 * this doc's exact history, so the server can store it verbatim instead of
 * minting a parallel identity from HTML.
 */
export function docStateToBase64(doc: Y.Doc): string {
  const update = Y.encodeStateAsUpdate(doc);
  let binary = '';
  for (let i = 0; i < update.length; i += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(
      ...update.subarray(i, i + BASE64_CHUNK_BYTES)
    );
  }
  return btoa(binary);
}
