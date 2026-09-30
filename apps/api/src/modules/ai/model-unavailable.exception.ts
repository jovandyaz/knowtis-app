import { UnprocessableEntityException } from '@nestjs/common';

import type { ModelUnavailableReason } from '@knowtis/shared-types';

import { AIErrors } from './domain/errors/ai.errors';

export class ModelUnavailableException extends UnprocessableEntityException {
  constructor(reason: ModelUnavailableReason, suggestedModel: string | null) {
    const { code, message } = AIErrors.modelUnavailable(reason, suggestedModel);
    super({ message, code, details: { reason, suggestedModel } });
  }
}
