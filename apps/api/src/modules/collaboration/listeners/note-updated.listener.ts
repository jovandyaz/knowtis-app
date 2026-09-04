import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { NoteUpdatedEvent } from '../../notes/domain/events/note-updated.event';
import { HocuspocusService } from '../hocuspocus.service';

/**
 * Propagates REST/MCP-side note updates (`update-note` command) to live
 * Hocuspocus collaboration sessions so editor clients see external mutations
 * without a manual refresh.
 *
 * Replaces the equivalent `@OnEvent` handler that lived on the legacy
 * `CollaborationGateway`.
 */
@Injectable()
export class NoteUpdatedListener {
  private readonly logger = new Logger(NoteUpdatedListener.name);

  constructor(private readonly hocuspocus: HocuspocusService) {}

  @OnEvent(NoteUpdatedEvent.EVENT_NAME, { async: true })
  async handleExternalNoteUpdate(event: NoteUpdatedEvent): Promise<void> {
    if (
      event.updates.content === undefined ||
      !event.yjsState ||
      event.yjsState.byteLength === 0
    ) {
      return;
    }

    try {
      const applied = await this.hocuspocus.applyExternalUpdate(
        event.aggregateId,
        new Uint8Array(event.yjsState)
      );

      if (applied) {
        this.logger.debug(
          `Broadcast external content update to live document ${event.aggregateId}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to broadcast external update for note ${event.aggregateId}`,
        error instanceof Error ? error.stack : error
      );
    }
  }
}
