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
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(NOTE_TITLE_MAX_LENGTH, {
    message: `Title must be at most ${NOTE_TITLE_MAX_LENGTH} characters`,
  })
  title!: string;

  @IsString()
  @IsOptional()
  content?: string;
}

export class UpdateNoteDto {
  @IsString()
  @IsOptional()
  @MaxLength(NOTE_TITLE_MAX_LENGTH, {
    message: `Title must be at most ${NOTE_TITLE_MAX_LENGTH} characters`,
  })
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsEnum(GENERAL_ACCESS_LEVELS, {
    message: 'General access must be either restricted or anyone_with_link',
  })
  @IsOptional()
  generalAccess?: GeneralAccessLevel;

  @IsEnum(PERMISSION_LEVELS, {
    message: 'Permission must be either viewer or editor',
  })
  @IsOptional()
  generalAccessPermission?: PermissionLevel;

  @IsBoolean()
  @IsOptional()
  editorsCanShare?: boolean;
}

export class ShareNoteDto {
  @IsUUID('4', { message: 'Invalid user ID format' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @IsEnum(PERMISSION_LEVELS, {
    message: 'Permission must be either viewer or editor',
  })
  @IsNotEmpty({ message: 'Permission is required' })
  permission!: PermissionLevel;
}

export class NotesQueryDto {
  @IsString()
  @IsOptional()
  search?: string;
}
