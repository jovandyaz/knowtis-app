import { afterEach, describe, expect, it, vi } from 'vitest';

import { log } from '../middleware/logger.js';

describe('log', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one JSON line whose message is the event, even over a message field', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    log({
      level: 'warn',
      event: 'tool_call',
      message: 'caller supplied text',
      tool: 'get-note',
    });

    expect(write).toHaveBeenCalledTimes(1);
    const line = String(write.mock.calls[0][0]);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({
      level: 'warn',
      event: 'tool_call',
      message: 'tool_call',
      tool: 'get-note',
      timestamp: expect.any(String),
    });
  });
});
