import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth/server';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsHexadecimal,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

const VERIFICATION_CODE_PATTERN = new RegExp(
  `^\\d{${VERIFICATION_CODE_LENGTH}}$`
);

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

  @ApiProperty({
    description:
      'Anonymous user ID to migrate data from (notes, AI usage) on registration',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  anonymousUserId?: string;

  @ApiProperty({
    description:
      'Anonymous session JWT token for ownership verification during data migration',
    required: false,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  anonymousToken?: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: i18nValidationMessage('validation.INVALID_EMAIL') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  email!: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePassword123!',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  password!: string;

  @ApiProperty({
    description:
      'Anonymous user ID to migrate data from (notes, AI usage) on login',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  anonymousUserId?: string;

  @ApiProperty({
    description:
      'Anonymous session JWT token for ownership verification during data migration',
    required: false,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  anonymousToken?: string;
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

export class VerifyEmailCodeDto {
  @ApiProperty({
    description: 'Six-digit verification code received via email',
    example: '123456',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @Matches(VERIFICATION_CODE_PATTERN, {
    message: i18nValidationMessage('validation.INVALID_CODE'),
  })
  code!: string;
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

export class AnonymousSessionDto {
  @ApiProperty({
    description:
      'Previously issued anonymous JWT; when valid, the same anonymous identity is reused',
    required: false,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  anonymousToken?: string;
}
