import { randomUUID } from 'node:crypto';

import type { AccessTier } from '@knowtis/shared-types';

import type { DomainEvent } from '../../../../core/domain/events/domain-event.interface';

export class MessageQuotaExhaustedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'ai.quota.exhausted';
  readonly name = MessageQuotaExhaustedEvent.EVENT_NAME;
  readonly id: string;
  readonly occurredOn: Date;
  readonly aggregateId: string;

  constructor(
    public readonly userId: string,
    public readonly tier: AccessTier
  ) {
    this.id = randomUUID();
    this.occurredOn = new Date();
    this.aggregateId = userId;
  }
}
