import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RecordingTimer } from './RecordingTimer';

function indicatorOf(bar: HTMLElement): HTMLElement {
  return bar.firstElementChild as HTMLElement;
}

describe('RecordingTimer', () => {
  it('names the progress bar with the time it displays', () => {
    render(<RecordingTimer elapsed={45} maxDuration={300} isRecording />);
    const bar = screen.getByRole('progressbar', { name: '00:45 / 05:00' });
    expect(bar).toHaveAttribute('aria-valuenow', '45');
    expect(bar).toHaveAttribute('aria-valuemax', '300');
  });

  it('keeps the primary tone while the limit is far away', () => {
    render(<RecordingTimer elapsed={45} maxDuration={300} isRecording />);
    expect(indicatorOf(screen.getByRole('progressbar')).className).toContain(
      'bg-(--primary)'
    );
  });

  it('turns the bar and the clock destructive near the limit', () => {
    render(<RecordingTimer elapsed={275} maxDuration={300} isRecording />);
    expect(indicatorOf(screen.getByRole('progressbar')).className).toContain(
      'bg-(--destructive)'
    );
    expect(screen.getByText('04:35').className).toContain(
      'text-(--destructive)'
    );
  });

  it('hides the recording dot when the recorder is paused', () => {
    const { container } = render(
      <RecordingTimer elapsed={120} maxDuration={300} isRecording={false} />
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
