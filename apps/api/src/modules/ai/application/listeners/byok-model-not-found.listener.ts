import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { BYOK_KEY_FAILURE_KIND } from '@knowtis/shared-types';

import { ByokKeyFailedEvent } from '../../domain/events/byok-key-failed.event';
import { ByokModelsService } from '../services/byok-models.service';

/** Re-lists a BYOK key whose provider could not find the model a turn asked for, so its listing stops offering that model. */
@Injectable()
export class ByokModelNotFoundListener {
  constructor(private readonly byokModels: ByokModelsService) {}

  @OnEvent(ByokKeyFailedEvent.EVENT_NAME, { async: true })
  async onKeyFailed(event: ByokKeyFailedEvent): Promise<void> {
    if (event.kind === BYOK_KEY_FAILURE_KIND.MODEL) {
      await this.byokModels.reportModelNotFound(event.userId, event.provider);
    }
  }
}
