import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

import { MAX_BULK_SUGGEST_NOTES } from '@knowtis/shared-types';

export class SuggestOrganizationDto {
  @ApiProperty({
    description: 'Notes to classify; every id must belong to the caller',
    type: [String],
    maxItems: MAX_BULK_SUGGEST_NOTES,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_SUGGEST_NOTES)
  @IsUUID('4', { each: true })
  noteIds!: string[];
}
