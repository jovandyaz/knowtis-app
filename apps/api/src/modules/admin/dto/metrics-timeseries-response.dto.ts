import { ApiProperty } from '@nestjs/swagger';

class TimeseriesBucketDto {
  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  bucketStart!: string;

  @ApiProperty({ example: 12 })
  requests!: number;

  @ApiProperty({ example: 5200 })
  inputTokens!: number;

  @ApiProperty({ example: 1800 })
  outputTokens!: number;

  @ApiProperty({ format: 'float', example: 0.0125 })
  costUsd!: number;
}

export class MetricsTimeseriesResponseDto {
  @ApiProperty({ type: [TimeseriesBucketDto] })
  buckets!: TimeseriesBucketDto[];
}
