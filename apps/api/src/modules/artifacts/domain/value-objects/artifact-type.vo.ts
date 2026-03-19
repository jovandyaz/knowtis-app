import { err, ok, type Result } from 'neverthrow';

import {
  ARTIFACT_TYPES,
  type ArtifactType as ArtifactTypeEnum,
} from '@knowtis/shared-types';

import { ArtifactErrors, type ArtifactDomainError } from '../errors';

export class ArtifactType {
  private constructor(public readonly value: ArtifactTypeEnum) {}

  static create(type: string): Result<ArtifactType, ArtifactDomainError> {
    if (!type || !ARTIFACT_TYPES.includes(type as ArtifactTypeEnum)) {
      return err(ArtifactErrors.invalidType(type));
    }
    return ok(new ArtifactType(type as ArtifactTypeEnum));
  }

  toPrimitive(): ArtifactTypeEnum {
    return this.value;
  }
}
