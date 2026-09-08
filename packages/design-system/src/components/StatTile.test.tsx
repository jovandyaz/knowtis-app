import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('renders the value and its label', () => {
    render(<StatTile value={7} label="Day streak" />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Day streak')).toBeInTheDocument();
  });

  it('groups the value under its label, so a reader can scope to one tile', () => {
    render(<StatTile value={7} label="Day streak" />);
    const tile = screen.getByRole('group', { name: 'Day streak' });
    expect(within(tile).getByText('7')).toBeInTheDocument();
  });

  it('signs and colours a positive delta', () => {
    render(
      <StatTile
        value={12}
        label="Reviewed today"
        delta={{ value: 3, label: '3 more than yesterday' }}
      />
    );
    const sign = screen.getByText('+3');
    expect(sign.className).toContain('text-learn-correct-text');
    expect(sign).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('3 more than yesterday')).toHaveClass('sr-only');
  });

  it('colours a negative delta as incorrect', () => {
    render(
      <StatTile value={1} label="Due" delta={{ value: -2, label: '2 fewer' }} />
    );
    const sign = screen.getByText('-2');
    expect(sign.className).toContain('text-learn-incorrect-text');
    expect(screen.getByText('2 fewer')).toHaveClass('sr-only');
  });

  it('colours a zero delta as muted', () => {
    render(
      <StatTile
        value={5}
        label="Streak"
        delta={{ value: 0, label: 'No change since yesterday' }}
      />
    );
    const sign = screen.getByText('0');
    expect(sign.className).toContain('text-(--muted-foreground)');
  });

  it('renders a negative zero delta as an unsigned zero, muted', () => {
    render(
      <StatTile
        value={5}
        label="Streak"
        delta={{ value: -0, label: 'No change since yesterday' }}
      />
    );
    const sign = screen.getByText('0');
    expect(sign.className).toContain('text-(--muted-foreground)');
  });

  it('renders a NaN delta as zero instead of leaking NaN to the screen', () => {
    render(
      <StatTile
        value={5}
        label="Streak"
        delta={{ value: NaN, label: 'No change since yesterday' }}
      />
    );
    const sign = screen.getByText('0');
    expect(sign.className).toContain('text-(--muted-foreground)');
  });

  it('renders an icon hidden from assistive tech', () => {
    render(<StatTile value={7} label="Day streak" icon={<span>🔥</span>} />);
    expect(
      screen.getByText('🔥').closest('span[aria-hidden="true"]')
    ).not.toBeNull();
  });

  it('forwards rest props like id and data attributes to the root div', () => {
    render(
      <StatTile
        value={7}
        label="Day streak"
        id="stat-streak"
        data-testid="stat-root"
      />
    );
    const root = screen.getByTestId('stat-root');
    expect(root).toHaveAttribute('id', 'stat-streak');
  });
});
