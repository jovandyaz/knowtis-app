import { ApiProperty } from '@nestjs/swagger';

export class AuditEntryResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  actorId!: string;

  @ApiProperty({
    nullable: true,
    format: 'email',
    example: 'admin@example.com',
  })
  actorEmail!: string | null;

  @ApiProperty({ example: 'user.role_changed' })
  action!: string;

  @ApiProperty({ example: 'user' })
  targetType!: string;

  @ApiProperty({
    nullable: true,
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  targetId!: string | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: { role: 'user' },
  })
  before!: Record<string, unknown> | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: { role: 'admin' },
  })
  after!: Record<string, unknown> | null;

  @ApiProperty({ format: 'date-time', example: '2024-01-15T10:30:00.000Z' })
  createdAt!: Date;
}

export class PaginatedAuditResponseDto {
  @ApiProperty({ type: [AuditEntryResponseDto] })
  items!: AuditEntryResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  limit!: number;
}
