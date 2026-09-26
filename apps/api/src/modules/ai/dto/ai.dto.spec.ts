import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { AICompleteDto } from './ai.dto';

function errorsFor(payload: object) {
  return validate(
    plainToInstance(AICompleteDto, payload, {
      enableImplicitConversion: true,
    })
  );
}

describe('AICompleteDto', () => {
  it('should accept a completion action', async () => {
    expect(
      await errorsFor({ action: AI_ACTION.SUMMARIZE, content: 'Some content' })
    ).toHaveLength(0);
  });

  it('should reject an artifact-only action', async () => {
    const errors = await errorsFor({
      action: AI_ACTION.GENERATE_QUIZ,
      content: 'Some content',
    });

    expect(errors.map((e) => e.property)).toEqual(['action']);
  });
});
