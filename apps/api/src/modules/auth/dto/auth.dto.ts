import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsHexadecimal,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'newuser@example.com',
  })
  @IsEmail({}, { message: i18nValidationMessage('validation.INVALID_EMAIL') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  email!: string;

  @ApiProperty({
    description: 'User display name',
    example: 'John Doe',
    minLength: 2,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MinLength(2, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  name!: string;

  @ApiProperty({
    description: 'User password (min 8 characters)',
    example: 'SecurePassword123!',
    minLength: 8,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address associated with the account',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: i18nValidationMessage('validation.INVALID_EMAIL') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @IsHexadecimal({ message: i18nValidationMessage('validation.INVALID_HEX') })
  @Length(64, 64, {
    message: i18nValidationMessage('validation.INVALID_LENGTH'),
  })
  token!: string;

  @ApiProperty({
    description: 'New password (min 8 characters)',
    example: 'NewSecureP@ss1',
    minLength: 8,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  newPassword!: string;
}

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token received via email',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @IsHexadecimal({ message: i18nValidationMessage('validation.INVALID_HEX') })
  @Length(64, 64, {
    message: i18nValidationMessage('validation.INVALID_LENGTH'),
  })
  token!: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'JWT refresh token (optional when sent via HttpOnly cookie)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: false,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  refreshToken?: string;
}
