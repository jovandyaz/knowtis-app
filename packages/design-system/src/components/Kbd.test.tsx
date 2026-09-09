import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Kbd } from './Kbd';

describe('Kbd', () => {
  it('renders a keyboard key element with its label', () => {
    render(<Kbd>Space</Kbd>);
    const key = screen.getByText('Space');
    expect(key.tagName).toBe('KBD');
    expect(key).toHaveAttribute('aria-hidden', 'true');
  });

  it('can be exposed to assistive tech when it is the only hint', () => {
    render(<Kbd aria-hidden={false}>1</Kbd>);
    expect(screen.getByText('1')).toHaveAttribute('aria-hidden', 'false');
  });
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(<Kbd ref={ref}>Enter</Kbd>);
    expect(ref.current).toBe(screen.getByText('Enter'));
  });
});
