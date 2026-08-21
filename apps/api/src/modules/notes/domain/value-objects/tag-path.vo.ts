import { err, ok, type Result } from 'neverthrow';

import {
  TAG_MAX_DEPTH,
  TAG_PATH_MAX_LENGTH,
  TAG_PATH_SEPARATOR,
  TAG_SEGMENT_MAX_LENGTH,
  TAG_SEGMENT_PATTERN,
} from '@knowtis/shared-types';

import { NoteErrors, type NoteDomainError } from '../errors';

export class TagPath {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<TagPath, NoteDomainError> {
    const normalized = raw.trim().toLowerCase();

    if (normalized.length === 0) {
      return err(NoteErrors.invalidTag('Tag path cannot be empty'));
    }

    if (normalized.length > TAG_PATH_MAX_LENGTH) {
      return err(
        NoteErrors.invalidTag(
          `Tag path cannot exceed ${TAG_PATH_MAX_LENGTH} characters`
        )
      );
    }

    const segments = normalized.split(TAG_PATH_SEPARATOR);

    if (segments.length > TAG_MAX_DEPTH) {
      return err(
        NoteErrors.invalidTag(
          `Tag path cannot nest deeper than ${TAG_MAX_DEPTH}`
        )
      );
    }

    for (const segment of segments) {
      if (segment.length > TAG_SEGMENT_MAX_LENGTH) {
        return err(
          NoteErrors.invalidTag(
            `Tag segment "${segment}" exceeds ${TAG_SEGMENT_MAX_LENGTH} characters`
          )
        );
      }
      if (!TAG_SEGMENT_PATTERN.test(segment)) {
        return err(
          NoteErrors.invalidTag(
            `Tag segment "${segment}" may only contain lowercase letters, digits and hyphens`
          )
        );
      }
    }

    return ok(new TagPath(normalized));
  }

  get segments(): string[] {
    return this.value.split(TAG_PATH_SEPARATOR);
  }

  get depth(): number {
    return this.segments.length;
  }

  get root(): string {
    return this.segments[0] as string;
  }

  /**
   * Every ancestor path plus this one, shallowest first. The tree needs its
   * intermediate nodes to render, so they are materialized as rows rather than
   * inferred at read time.
   */
  withAncestors(): string[] {
    return this.segments.map((_, i) =>
      this.segments.slice(0, i + 1).join(TAG_PATH_SEPARATOR)
    );
  }

  toPrimitive(): string {
    return this.value;
  }
}
