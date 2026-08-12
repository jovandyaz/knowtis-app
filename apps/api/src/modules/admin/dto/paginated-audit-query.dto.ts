import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { MAX_LIMIT, MAX_PAGE } from '../../../core/pagination';

export class PaginatedAuditQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIMIT, default: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  @IsOptional()
  limit?: number;
}
