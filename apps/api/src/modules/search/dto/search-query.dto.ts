import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({
    description: 'Search query matched against note titles and content',
    example: 'quarterly report',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @Length(1, 200)
  q!: string;

  @ApiPropertyOptional({
    description: 'Maximum number of hits to return',
    default: 20,
    minimum: 1,
    maximum: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limit?: number;
}
