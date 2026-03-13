import { USER_ROLE, type UserRole } from '@jovandyaz/auth';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({
    description: 'The role to assign to the user',
    enum: Object.values(USER_ROLE),
    example: 'admin',
  })
  @IsString()
  @IsIn(Object.values(USER_ROLE))
  role!: UserRole;
}
