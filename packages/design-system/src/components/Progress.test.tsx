import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Progress } from './Progress';

describe('Progress', () => {
  it('exposes value, max and label to assistive tech', () => {
    render(<Progress value={3} max={10} label="3 of 10 questions" />);
    const bar = screen.getByRole('progressbar', { name: '3 of 10 questions' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
    expect(bar).not.toHaveAttribute('aria-labelledby');
  });

  it('borrows its name from a visible caption instead of repeating it', () => {
    render(
      <>
        <span id="elapsed">00:45 / 05:00</span>
        <Progress value={45} max={300} labelledBy="elapsed" />
      </>
    );
    const bar = screen.getByRole('progressbar', { name: '00:45 / 05:00' });
    expect(bar).toHaveAttribute('aria-labelledby', 'elapsed');
    expect(bar).not.toHaveAttribute('aria-label');
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

  it('paints the danger tone with the destructive token', () => {
    render(<Progress value={9} max={10} label="Almost out" tone="danger" />);
    const indicator = screen.getByRole('progressbar')
      .firstElementChild as HTMLElement;
    expect(indicator.className).toContain('bg-(--destructive)');
  });

  it('floors a non-positive max without Radix logging a console error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Progress value={0} max={0} label="Empty deck" />);
    const bar = screen.getByRole('progressbar');
    const indicator = bar.firstElementChild as HTMLElement;
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '1');
    expect(indicator.style.transform).toBe('translateX(-100%)');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('floors a negative max without Radix logging a console error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Progress value={0} max={-3} label="Negative deck" />);
    const bar = screen.getByRole('progressbar');
    const indicator = bar.firstElementChild as HTMLElement;
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '1');
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

  it('carries the reduced-motion transition escape hatch', () => {
    render(<Progress value={5} max={10} label="Half" />);
    const indicator = screen.getByRole('progressbar')
      .firstElementChild as HTMLElement;
    expect(indicator.className).toContain('motion-reduce:transition-none');
  });

  it('eases the indicator with the tokenised enter curve', () => {
    render(<Progress value={5} max={10} label="Half" />);
    const indicator = screen.getByRole('progressbar')
      .firstElementChild as HTMLElement;
    expect(indicator.className).toContain('ease-enter');
  });
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Progress ref={ref} value={1} max={2} label="Half" />);
    expect(ref.current).toBe(screen.getByRole('progressbar'));
  });
});
