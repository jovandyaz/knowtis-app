import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Progress } from './Progress';

describe('Progress', () => {
  it('exposes value, max and label to assistive tech', () => {
    render(<Progress value={3} max={10} label="3 of 10 questions" />);
    const bar = screen.getByRole('progressbar', { name: '3 of 10 questions' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
  });

  it('fills the indicator proportionally', () => {
    render(<Progress value={25} max={100} label="Quarter" />);
    const indicator = screen.getByRole('progressbar')
      .firstElementChild as HTMLElement;
    expect(indicator.style.transform).toBe('translateX(-75%)');
  });

  it('colours the indicator by tone', () => {
    render(<Progress value={1} max={2} label="Half" tone="correct" />);
    const indicator = screen.getByRole('progressbar')
      .firstElementChild as HTMLElement;
    expect(indicator.className).toContain('bg-learn-correct');
  });

  it('floors a non-positive max without Radix logging a console error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Progress value={0} max={0} label="Empty deck" />);
    const bar = screen.getByRole('progressbar');
    const indicator = bar.firstElementChild as HTMLElement;
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(indicator.style.transform).toBe('translateX(-100%)');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('clamps a value above max instead of overflowing the indicator', () => {
    render(<Progress value={12} max={10} label="Overflow" />);
    const bar = screen.getByRole('progressbar');
    const indicator = bar.firstElementChild as HTMLElement;
    expect(bar).toHaveAttribute('aria-valuenow', '10');
    expect(indicator.style.transform).toBe('translateX(-0%)');
  });

  it('disables the transition under prefers-reduced-motion', () => {
    render(<Progress value={5} max={10} label="Half" />);
    const indicator = screen.getByRole('progressbar')
      .firstElementChild as HTMLElement;
    expect(indicator.className).toContain('motion-reduce:transition-none');
  });
});
