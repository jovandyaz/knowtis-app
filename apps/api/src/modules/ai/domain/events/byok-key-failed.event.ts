import { randomUUID } from 'node:crypto';

import type { ByokKeyFailureKind, ByokProvider } from '@knowtis/shared-types';

import type { DomainEvent } from '../../../../core/domain/events/domain-event.interface';

export class ByokKeyFailedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'ai.byok.key_failed';
  readonly name = ByokKeyFailedEvent.EVENT_NAME;
  readonly id: string;
  readonly occurredOn: Date;
  readonly aggregateId: string;

  constructor(
    public readonly userId: string,
    public readonly provider: ByokProvider,
    public readonly kind: ByokKeyFailureKind
  ) {
    this.id = randomUUID();
    this.occurredOn = new Date();
    this.aggregateId = userId;
  }
}
