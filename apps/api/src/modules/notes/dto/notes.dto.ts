import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import {
  GENERAL_ACCESS_LEVELS,
  NOTE_TITLE_MAX_LENGTH,
  PERMISSION_LEVELS,
  type GeneralAccessLevel,
  type PermissionLevel,
} from '@knowtis/shared-types';

export class CreateNoteDto {
  @ApiProperty({
    description: 'Title of the note',
    example: 'Meeting Notes',
    maxLength: NOTE_TITLE_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(NOTE_TITLE_MAX_LENGTH, {
    message: `Title must be at most ${NOTE_TITLE_MAX_LENGTH} characters`,
  })
  title!: string;

  @ApiPropertyOptional({
    description: 'Initial HTML content of the note',
    example: '<p>Hello world</p>',
  })
  @IsString()
  @IsOptional()
  content?: string;
}

export class UpdateNoteDto {
  @ApiPropertyOptional({
    description: 'New title for the note',
    example: 'Updated Title',
    maxLength: NOTE_TITLE_MAX_LENGTH,
  })
  @IsString()
  @IsOptional()
  @MaxLength(NOTE_TITLE_MAX_LENGTH, {
    message: `Title must be at most ${NOTE_TITLE_MAX_LENGTH} characters`,
  })
  title?: string;

  @ApiPropertyOptional({
    description: 'New HTML content for the note',
    example: '<p>Updated content</p>',
  })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({
    description: 'General access level for the note',
    enum: [...GENERAL_ACCESS_LEVELS],
    example: 'restricted',
  })
  @IsEnum(GENERAL_ACCESS_LEVELS, {
    message: 'General access must be either restricted or anyone_with_link',
  })
  @IsOptional()
  generalAccess?: GeneralAccessLevel;

  @ApiPropertyOptional({
    description: 'Default permission for users accessing via link',
    enum: [...PERMISSION_LEVELS],
    example: 'viewer',
  })
  @IsEnum(PERMISSION_LEVELS, {
    message: 'Permission must be either viewer or editor',
  })
  @IsOptional()
  generalAccessPermission?: PermissionLevel;

  @ApiPropertyOptional({
    description: 'Whether editors are allowed to share the note',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  editorsCanShare?: boolean;
}

export class ShareNoteDto {
  @ApiProperty({
    description: 'UUID of the user to share with',
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID('4', { message: 'Invalid user ID format' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @ApiProperty({
    description: 'Permission level to grant',
    enum: [...PERMISSION_LEVELS],
    example: 'editor',
  })
  @IsEnum(PERMISSION_LEVELS, {
    message: 'Permission must be either viewer or editor',
  })
  @IsNotEmpty({ message: 'Permission is required' })
  permission!: PermissionLevel;
}

export class NotesQueryDto {
  @ApiPropertyOptional({
    description: 'Search term to filter notes by title',
    example: 'meeting',
  })
  @IsString()
  @IsOptional()
  search?: string;
}
