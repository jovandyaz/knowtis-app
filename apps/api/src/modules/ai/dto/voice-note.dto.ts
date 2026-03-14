import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class VoiceNoteDto {
  @ApiProperty({ enum: ['create-note', 'insert'] })
  @IsEnum(['create-note', 'insert'])
  mode!: 'create-note' | 'insert';

  @ApiPropertyOptional({
    description:
      'ISO-639-1 language code (e.g., "en", "es"). Auto-detected if omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;
}
