import { randomUUID } from 'node:crypto';

import type { AccessTier } from '@knowtis/shared-types';

import type { DomainEvent } from '../../../../core/domain/events/domain-event.interface';

export class MessageQuotaConsumedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'ai.quota.consumed';
  readonly name = MessageQuotaConsumedEvent.EVENT_NAME;
  readonly id: string;
  readonly occurredOn: Date;
  readonly aggregateId: string;

  constructor(
    public readonly userId: string,
    public readonly tier: AccessTier,
    public readonly used: number,
    public readonly limit: number
  ) {
    this.id = randomUUID();
    this.occurredOn = new Date();
    this.aggregateId = userId;
  }
}
