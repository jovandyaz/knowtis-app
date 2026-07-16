import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatCard } from '../StatCard';

describe('StatCard', () => {
  it('renders label, value and optional hint', () => {
    render(<StatCard label="Cost" value="$0.0125" hint="12 in · 3 out" />);
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(screen.getByText('$0.0125')).toBeInTheDocument();
    expect(screen.getByText('12 in · 3 out')).toBeInTheDocument();
  });

  it('omits the hint row when not provided', () => {
    render(<StatCard label="Requests" value="42" />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});
