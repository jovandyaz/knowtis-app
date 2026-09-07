import { randomUUID } from 'crypto';

import type { FlashcardReviewKind } from '@knowtis/shared-types';

import { DomainEvent } from '../../../../core/domain/events/domain-event.interface';

export class FlashcardReviewedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'flashcard.reviewed';
  readonly name = FlashcardReviewedEvent.EVENT_NAME;
  readonly id: string;
  readonly occurredOn: Date;

  constructor(
    public readonly aggregateId: string,
    public readonly userId: string,
    public readonly quality: number,
    public readonly kind: FlashcardReviewKind
  ) {
    this.id = randomUUID();
    this.occurredOn = new Date();
  }
}
