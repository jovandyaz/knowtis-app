import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RateLimitAlert } from './RateLimitAlert';

describe('RateLimitAlert', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<RateLimitAlert ref={ref} visible message="Slow down" />);
    expect(ref.current).toBe(screen.getByRole('alert'));
  });
});
