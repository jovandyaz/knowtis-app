import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { SUPPORTED_LOCALES } from '@knowtis/shared-util';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'User display name',
    example: 'John Doe',
    required: false,
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(2, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(100, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name?: string;

  @ApiProperty({
    description: 'URL to user avatar image',
    example: 'https://example.com/avatar.jpg',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(500, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  avatarUrl?: string;

  @ApiProperty({
    description: 'Preferred locale for the user',
    example: 'en',
    required: false,
    enum: SUPPORTED_LOCALES,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsIn([...SUPPORTED_LOCALES], {
    message: i18nValidationMessage('validation.IS_IN'),
  })
  locale?: string;
}
