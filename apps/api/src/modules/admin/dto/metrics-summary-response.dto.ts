import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';

class ActionMetricsDto {
  @ApiProperty({ example: 100 })
  requests!: number;

  @ApiProperty({ example: 50000 })
  tokens!: number;

  @ApiProperty({ format: 'float', example: 0.075 })
  costUsd!: number;
}

@ApiExtraModels(ActionMetricsDto)
export class MetricsSummaryResponseDto {
  @ApiProperty({ example: 156 })
  totalRequests!: number;

  @ApiProperty({ example: 78400 })
  totalInputTokens!: number;

  @ApiProperty({ example: 34200 })
  totalOutputTokens!: number;

  @ApiProperty({ format: 'float', example: 0.1125 })
  totalCostUsd!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(ActionMetricsDto) },
    example: {
      'text-completion': { requests: 100, tokens: 50000, costUsd: 0.075 },
      'text-streaming': { requests: 56, tokens: 62600, costUsd: 0.0375 },
    },
  })
  byAction!: Record<string, ActionMetricsDto>;
}
