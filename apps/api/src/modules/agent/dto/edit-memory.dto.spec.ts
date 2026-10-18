import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { MEMORY_MAX_CHARS } from '@knowtis/shared-types';

import { EditMemoryDto } from './edit-memory.dto';

function parse(payload: object): EditMemoryDto {
  return plainToInstance(EditMemoryDto, payload, {
    enableImplicitConversion: true,
  });
}

async function errorsFor(payload: object): Promise<string[]> {
  return (await validate(parse(payload))).map((error) => error.property);
}

describe('EditMemoryDto', () => {
  it('should trim the text it accepts', async () => {
    const dto = parse({ content: '  Is vegan \n' });

    expect(dto.content).toBe('Is vegan');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('should accept text at the memory cap once trimmed', async () => {
    expect(
      await errorsFor({ content: ` ${'x'.repeat(MEMORY_MAX_CHARS)} ` })
    ).toEqual([]);
  });

  it.each([
    ['blank text', '   '],
    ['text over the memory cap', 'x'.repeat(MEMORY_MAX_CHARS + 1)],
    ['a number', 123],
    ['null', null],
  ])('should reject %s', async (_what, content) => {
    expect(await errorsFor({ content })).toEqual(['content']);
  });

  it('should reject a missing text', async () => {
    expect(await errorsFor({})).toEqual(['content']);
  });
});
