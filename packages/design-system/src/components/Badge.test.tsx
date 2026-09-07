import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge';

describe('Badge', () => {
  it('renders the count variant as a compact numeric pill', () => {
    render(<Badge variant="count">12</Badge>);
    const badge = screen.getByText('12');
    expect(badge.className).toContain('tabular-nums');
    expect(badge.className).toContain('min-w-5');
  });

  it('keeps the default variant unchanged', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New').className).toContain('bg-(--foreground)');
  });
});
