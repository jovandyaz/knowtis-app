import { ApiProperty } from '@nestjs/swagger';

export class DailyUsageResponseDto {
  @ApiProperty({ example: 15420 })
  totalInputTokens!: number;

  @ApiProperty({ example: 8730 })
  totalOutputTokens!: number;

  @ApiProperty({ format: 'float', example: 0.0243 })
  totalCostUsd!: number;

  @ApiProperty({ example: 42 })
  requestCount!: number;
}
