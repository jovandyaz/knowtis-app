import { createRef } from 'react';

import { render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AudioWaveform } from './AudioWaveform';

// jsdom has no canvas backend, so getContext logs "Not implemented" on every
// render; the draw effect already bails when it yields no context.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('AudioWaveform', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLCanvasElement>();
    const { container } = render(<AudioWaveform ref={ref} />);
    expect(ref.current).toBe(container.querySelector('canvas'));
  });
});
