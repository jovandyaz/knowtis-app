import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isTrivialHtml } from './trivial-html';

vi.mock('@tiptap/html/server', () => ({
  generateJSON: () => {
    throw new Error('unparseable markup');
  },
}));

describe('isTrivialHtml on a parse failure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats the input as trivial and logs a structured warning', () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    expect(isTrivialHtml('<p>anything</p>')).toBe(true);
    expect(warn.mock.calls).toEqual([
      [
        {
          event: 'notes.trivial_html.parse_failed',
          stage: 'generateJSON',
          reason: 'unparseable markup',
        },
      ],
    ]);
  });
});
