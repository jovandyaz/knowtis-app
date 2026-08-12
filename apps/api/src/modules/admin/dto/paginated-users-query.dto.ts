import { USER_ROLE, type UserRole } from '@jovandyaz/auth';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MAX_PAGE } from '../../../core/pagination';

export class PaginatedUsersQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Case-insensitive email substring',
  })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: [USER_ROLE.USER, USER_ROLE.ADMIN] })
  @IsIn([USER_ROLE.USER, USER_ROLE.ADMIN])
  @IsOptional()
  role?: UserRole;
}
