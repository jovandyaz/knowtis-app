import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { NoteAccessChangedEvent } from '../domain/events/note-access-changed.event';

const logger = new Logger('NoteAccessChanged');

/** Best-effort invalidation must not turn a committed access write into failure. */
export function emitAccessChanged(events: EventEmitter2, noteId: string): void {
  try {
    events.emit(
      NoteAccessChangedEvent.EVENT_NAME,
      new NoteAccessChangedEvent(noteId)
    );
  } catch {
    logger.warn(
      'Access invalidation delivery failed; primary renewal remains active'
    );
  }
}
