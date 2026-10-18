import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { MEMORY_MAX_CHARS } from '@knowtis/shared-types';

export class EditMemoryDto {
  @ApiProperty({
    description: 'The new text of the memory, trimmed',
    minLength: 1,
    maxLength: MEMORY_MAX_CHARS,
  })
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
      const raw = obj[key];
      return typeof raw === 'string' ? raw.trim() : raw;
    },
    { toClassOnly: true }
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(MEMORY_MAX_CHARS)
  content!: string;
}
