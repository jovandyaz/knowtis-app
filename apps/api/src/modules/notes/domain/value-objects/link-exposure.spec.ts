import { describe, expect, it } from 'vitest';

import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

import { linkExposureRank, widensLinkExposure } from './link-exposure';

const closed = {
  generalAccess: GENERAL_ACCESS.RESTRICTED,
  generalAccessPermission: PERMISSION.VIEWER,
};
const closedButEditor = {
  generalAccess: GENERAL_ACCESS.RESTRICTED,
  generalAccessPermission: PERMISSION.EDITOR,
};
const readable = {
  generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
  generalAccessPermission: PERMISSION.VIEWER,
};
const writable = {
  generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
  generalAccessPermission: PERMISSION.EDITOR,
};

describe('linkExposureRank', () => {
  it('ranks a closed link below a readable one, and a readable one below a writable one', () => {
    expect(linkExposureRank(closed)).toBeLessThan(linkExposureRank(readable));
    expect(linkExposureRank(readable)).toBeLessThan(linkExposureRank(writable));
  });

  it('ignores the permission while the link is closed', () => {
    expect(linkExposureRank(closedButEditor)).toBe(linkExposureRank(closed));
  });
});

describe('widensLinkExposure', () => {
  it.each([
    ['opening a link', closed, readable],
    ['opening a link straight to editor', closed, writable],
    ['letting an open link write', readable, writable],
    [
      'opening a link whose permission was already editor',
      closedButEditor,
      writable,
    ],
  ])('is true when %s', (_label, before, after) => {
    expect(widensLinkExposure(before, after)).toBe(true);
  });

  it.each([
    ['closing a link', readable, closed],
    ['closing a writable link', writable, closed],
    ['taking write away from an open link', writable, readable],
    ['picking editor for a link that stays closed', closed, closedButEditor],
    ['re-affirming an open link', readable, readable],
  ])('is false when %s', (_label, before, after) => {
    expect(widensLinkExposure(before, after)).toBe(false);
  });
});
