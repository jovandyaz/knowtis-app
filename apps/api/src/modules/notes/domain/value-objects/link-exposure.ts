import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

export interface LinkExposureFields {
  readonly generalAccess: string;
  readonly generalAccessPermission: string;
}

const LINK_EXPOSURE_RANK = {
  CLOSED: 0,
  READ: 1,
  WRITE: 2,
} as const;

/** How much a note's link gives away: nothing, read access, or write access. */
export function linkExposureRank(note: LinkExposureFields): number {
  if (note.generalAccess !== GENERAL_ACCESS.ANYONE_WITH_LINK) {
    return LINK_EXPOSURE_RANK.CLOSED;
  }
  return note.generalAccessPermission === PERMISSION.EDITOR
    ? LINK_EXPOSURE_RANK.WRITE
    : LINK_EXPOSURE_RANK.READ;
}

/** True when `after` hands link holders more than `before` did. */
export function widensLinkExposure(
  before: LinkExposureFields,
  after: LinkExposureFields
): boolean {
  return linkExposureRank(after) > linkExposureRank(before);
}
