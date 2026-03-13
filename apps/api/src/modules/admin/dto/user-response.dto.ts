import { USER_ROLE } from '@jovandyaz/auth';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id!: string;

  @ApiProperty({ format: 'email', example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiPropertyOptional({ example: null })
  avatarUrl!: string | null;

  @ApiProperty({ enum: Object.values(USER_ROLE), example: 'user' })
  role!: string;

  @ApiProperty({ example: 'local' })
  provider!: string;

  @ApiProperty({ example: false })
  isAnonymous!: boolean;

  @ApiProperty({ format: 'date-time', example: '2024-01-15T10:30:00.000Z' })
  createdAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', example: null })
  emailVerifiedAt!: Date | null;
}
