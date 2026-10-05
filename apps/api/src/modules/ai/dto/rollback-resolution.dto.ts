import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import {
  MODEL_ID_MAX_LENGTH,
  type RollbackResolutionInput,
} from '@knowtis/shared-types';

export class RollbackResolutionDto implements RollbackResolutionInput {
  @ApiProperty({
    description: 'The active model the confirmation named',
    maxLength: MODEL_ID_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MODEL_ID_MAX_LENGTH)
  activeModelId!: string;

  @ApiProperty({
    description: 'The previous model the confirmation named: the one restored',
    maxLength: MODEL_ID_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MODEL_ID_MAX_LENGTH)
  previousModelId!: string;
}
