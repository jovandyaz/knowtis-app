import { randomUUID } from 'crypto';

import type { ArtifactType } from '@knowtis/shared-types';

import { DomainEvent } from '../../../../core/domain/events/domain-event.interface';

export class ArtifactGeneratedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'artifact.generated';
  readonly name = ArtifactGeneratedEvent.EVENT_NAME;
  readonly id: string;
  readonly occurredOn: Date;

  constructor(
    public readonly aggregateId: string,
    public readonly userId: string,
    public readonly artifactType: ArtifactType
  ) {
    this.id = randomUUID();
    this.occurredOn = new Date();
  }
}
