import { randomUUID } from 'node:crypto';

import type { AccessTier } from '@knowtis/shared-types';

import type { DomainEvent } from '../../../../core/domain/events/domain-event.interface';

export class TurnContinuedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'agent.turn.continued';
  readonly name = TurnContinuedEvent.EVENT_NAME;
  readonly id: string;
  readonly occurredOn: Date;
  readonly aggregateId: string;

  constructor(
    public readonly userId: string,
    public readonly tier: AccessTier,
    public readonly segmentIndex: number
  ) {
    this.id = randomUUID();
    this.occurredOn = new Date();
    this.aggregateId = userId;
  }
}
