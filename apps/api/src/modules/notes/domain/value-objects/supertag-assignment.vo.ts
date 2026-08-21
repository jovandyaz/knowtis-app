import { err, ok, type Result } from 'neverthrow';

import {
  SUPERTAG_CATALOG,
  SUPERTAGS,
  type Supertag,
  type SupertagField,
  type SupertagFields,
} from '@knowtis/shared-types';

import { NoteErrors, type NoteDomainError } from '../errors';

export interface SupertagAssignmentValue {
  readonly supertag: Supertag | null;
  readonly supertagFields: SupertagFields | null;
}

function isSupertag(value: string): value is Supertag {
  return (SUPERTAGS as readonly string[]).includes(value);
}

function isBlank(value: string | number | null): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

function describe(supertag: Supertag): string {
  return `type "${supertag}"`;
}

export class SupertagAssignment {
  private constructor(public readonly value: SupertagAssignmentValue) {}

  /**
   * Clearing the type clears its fields in the same write — a fields blob with
   * no type is orphan data no reader could interpret.
   */
  static clear(): SupertagAssignment {
    return new SupertagAssignment({ supertag: null, supertagFields: null });
  }

  toPrimitive(): SupertagAssignmentValue {
    return this.value;
  }

  static create(
    supertag: string,
    fields: SupertagFields | undefined
  ): Result<SupertagAssignment, NoteDomainError> {
    if (!isSupertag(supertag)) {
      return err(NoteErrors.invalidSupertag(`Unknown supertag "${supertag}"`));
    }

    const label = describe(supertag);
    const descriptors: readonly SupertagField[] = SUPERTAG_CATALOG[supertag];
    const provided = fields ?? {};
    const known = new Set(descriptors.map((field) => field.key));

    for (const key of Object.keys(provided)) {
      if (!known.has(key)) {
        return err(
          NoteErrors.invalidSupertag(`"${key}" is not a field of ${label}`)
        );
      }
    }

    const normalized: SupertagFields = {};
    for (const descriptor of descriptors) {
      const raw = provided[descriptor.key] ?? null;

      if (descriptor.required && isBlank(raw)) {
        return err(
          NoteErrors.invalidSupertag(
            `"${descriptor.key}" is required for ${label}`
          )
        );
      }

      if (
        descriptor.maxLength !== undefined &&
        typeof raw === 'string' &&
        raw.length > descriptor.maxLength
      ) {
        return err(
          NoteErrors.invalidSupertag(
            `"${descriptor.key}" of ${label} cannot exceed ${descriptor.maxLength} characters`
          )
        );
      }

      normalized[descriptor.key] = raw;
    }

    return ok(new SupertagAssignment({ supertag, supertagFields: normalized }));
  }
}
