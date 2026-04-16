import { randomUUID } from 'crypto';

import { DomainEvent } from '../../../../core/domain/events/domain-event.interface';

export interface NoteUpdatedEventUpdates {
  readonly title?: string;
  readonly content?: string;
  readonly generalAccess?: string;
  readonly generalAccessPermission?: string;
  readonly editorsCanShare?: boolean;
}

export class NoteUpdatedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'note.updated';
  readonly name = NoteUpdatedEvent.EVENT_NAME;
  readonly id: string;
  readonly occurredOn: Date;
  readonly updates: NoteUpdatedEventUpdates;
  readonly yjsState: Buffer | undefined;

  constructor(
    public readonly aggregateId: string,
    updates: NoteUpdatedEventUpdates,
    public readonly performedBy: string,
    yjsState?: Buffer
  ) {
    this.updates = Object.freeze({ ...updates });
    this.yjsState = yjsState ? Buffer.from(yjsState) : undefined;
    this.id = randomUUID();
    this.occurredOn = new Date();
  }
}
