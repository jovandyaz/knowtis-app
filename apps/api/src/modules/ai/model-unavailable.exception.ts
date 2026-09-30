import { UnprocessableEntityException } from '@nestjs/common';

import {
  AI_MODEL_UNAVAILABLE_CODE,
  type ModelUnavailableReason,
} from '@knowtis/shared-types';

export class ModelUnavailableException extends UnprocessableEntityException {
  constructor(reason: ModelUnavailableReason, suggestedModel: string | null) {
    super({
      message: 'This model is not available to you.',
      code: AI_MODEL_UNAVAILABLE_CODE,
      details: { reason, suggestedModel },
    });
  }
}
