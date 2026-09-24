import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, MaxLength } from 'class-validator';

const IMPORTABLE_URL_PROTOCOLS = ['http', 'https'];
export const IMPORT_URL_MAX_LENGTH = 2048;

export class ImportImageDto {
  @ApiProperty({
    description: 'Absolute http(s) URL of the image to copy into the note',
    maxLength: IMPORT_URL_MAX_LENGTH,
    example: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg',
  })
  @IsUrl({ protocols: IMPORTABLE_URL_PROTOCOLS, require_protocol: true })
  @MaxLength(IMPORT_URL_MAX_LENGTH)
  url!: string;
}
