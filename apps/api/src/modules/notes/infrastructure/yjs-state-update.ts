import { err, ok, type Result } from 'neverthrow';
import * as Y from 'yjs';

import { NoteErrors, type NoteDomainError } from '../domain/errors';

export const YJS_STATE_MAX_BYTES = 1_000_000;

/**
 * Decodes a client-supplied base64 CRDT state into the buffer the note row
 * stores. The bytes are probed against a scratch doc before they are
 * accepted: garbage persisted here would make every later load of the note
 * fail in onLoadDocument.
 */
export function decodeYjsStateUpdate(
  base64: string
): Result<Buffer, NoteDomainError> {
  let update: Buffer;
  try {
    update = Buffer.from(base64, 'base64');
  } catch {
    return err(NoteErrors.invalidContent('yjsState is not valid base64'));
  }

  if (update.byteLength === 0 || update.byteLength > YJS_STATE_MAX_BYTES) {
    return err(
      NoteErrors.invalidContent(
        `yjsState must be between 1 and ${YJS_STATE_MAX_BYTES} bytes`
      )
    );
  }

  const probe = new Y.Doc();
  try {
    Y.applyUpdate(probe, new Uint8Array(update));
  } catch {
    return err(NoteErrors.invalidContent('yjsState is not a Yjs update'));
  } finally {
    probe.destroy();
  }

  return ok(update);
}
