import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  BUCKET_FILTERS,
  DEFAULT_NOTES_PAGE_SIZE,
  GENERAL_ACCESS_LEVELS,
  NOTE_LIST_VIEWS,
  NOTE_TITLE_MAX_LENGTH,
  PARA_BUCKETS,
  PERMISSION_LEVELS,
  SUPERTAGS,
  TAG_COLOR_MAX_LENGTH,
  TAG_MAX_PER_NOTE,
  TAG_PATH_MAX_LENGTH,
  type BucketFilter,
  type GeneralAccessLevel,
  type NoteListView,
  type ParaBucket,
  type PermissionLevel,
  type Supertag,
} from '@knowtis/shared-types';

import { MAX_LIMIT, MAX_PAGE } from '../../../core/pagination';

export class CreateNoteDto {
  @ApiPropertyOptional({
    description: 'Client-generated UUID v4 for the note',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'ID must be a valid UUID v4' })
  @IsOptional()
  id?: string;

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
    description:
      'Editor fallback: persist content to the column without regenerating yjsState from HTML (the live Y.Doc owns the CRDT state)',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  skipYjsState?: boolean;

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

  @ApiPropertyOptional({
    description: 'PARA bucket; null returns the note to Inbox',
    enum: [...PARA_BUCKETS],
    nullable: true,
  })
  @IsIn(PARA_BUCKETS)
  @IsOptional()
  bucket?: ParaBucket | null;

  @ApiPropertyOptional({
    description:
      "The note's complete tag set as paths; replaces whatever it carried",
    type: [String],
    example: ['work/projects/alpha', 'ai'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(TAG_MAX_PER_NOTE)
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Note type; null clears the type and its fields',
    enum: [...SUPERTAGS],
    nullable: true,
  })
  @IsIn(SUPERTAGS)
  @IsOptional()
  supertag?: Supertag | null;

  @ApiPropertyOptional({
    description: 'Values for the fields the type declares',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  supertagFields?: Record<string, unknown>;
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
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_LIMIT,
    default: DEFAULT_NOTES_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Search term to filter notes by title',
    example: 'meeting',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by PARA bucket',
    enum: [...BUCKET_FILTERS],
  })
  @IsIn(BUCKET_FILTERS)
  @IsOptional()
  bucket?: BucketFilter;

  @ApiPropertyOptional({
    description: 'Restrict to owned or shared notes',
    enum: [...NOTE_LIST_VIEWS],
  })
  @IsIn(NOTE_LIST_VIEWS)
  @IsOptional()
  view?: NoteListView;

  @ApiPropertyOptional({
    description: 'Filter by tag branch: the exact path or any descendant',
    example: 'work/projects',
  })
  @IsString()
  @MaxLength(TAG_PATH_MAX_LENGTH)
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({
    description: 'Filter by note type',
    enum: [...SUPERTAGS],
  })
  @IsIn(SUPERTAGS)
  @IsOptional()
  supertag?: Supertag;
}

export class UpdateTagDto {
  @ApiPropertyOptional({
    description: 'New path for the tag; descendants follow by prefix',
    example: 'work/projects/beta',
  })
  @IsString()
  @MaxLength(TAG_PATH_MAX_LENGTH)
  @IsOptional()
  path?: string;

  @ApiPropertyOptional({
    description: 'Colour token for the branch; null clears it',
    nullable: true,
  })
  @IsString()
  @MaxLength(TAG_COLOR_MAX_LENGTH)
  @IsOptional()
  color?: string | null;
}
