import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { NoteAccessChangedEvent } from '../../notes/domain/events/note-access-changed.event';
import { AccessInvalidationBus } from '../access-invalidation.bus';
import { AccessRevalidationService } from '../access-revalidation.service';

@Injectable()
export class NoteAccessChangedListener {
  private readonly logger = new Logger(NoteAccessChangedListener.name);
  constructor(
    private readonly access: AccessRevalidationService,
    private readonly bus: AccessInvalidationBus
  ) {}

  @OnEvent(NoteAccessChangedEvent.EVENT_NAME)
  async handle(event: NoteAccessChangedEvent): Promise<void> {
    const results = await Promise.allSettled([
      this.access.invalidate(event.noteId),
      this.bus.publish(event.noteId),
    ]);
    if (results.some((result) => result.status === 'rejected')) {
      this.logger.warn(
        'Access invalidation delivery unavailable; primary renewal remains active'
      );
    }
  }
}
