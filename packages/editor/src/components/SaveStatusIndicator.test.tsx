import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SaveStatusIndicator, type SaveStatus } from './SaveStatusIndicator';

const containerFor = (label: string) => screen.getByText(label).parentElement;

describe('SaveStatusIndicator', () => {
  it.each<SaveStatus>(['pending', 'saving', 'saved', 'error'])(
    'shows the caller label for the %s state',
    (status) => {
      render(<SaveStatusIndicator status={status} label={`${status} copy`} />);

      expect(screen.getByText(`${status} copy`)).toBeInTheDocument();
    }
  );

  it('spins only while a save is in flight', () => {
    const { container, rerender } = render(
      <SaveStatusIndicator status="saving" label="Saving..." />
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();

    rerender(<SaveStatusIndicator status="pending" label="Unsaved changes" />);

    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('does not claim success while changes are still queued', () => {
    const { container } = render(
      <SaveStatusIndicator status="pending" label="Unsaved changes" />
    );

    expect(container.querySelector('.text-\\(--success\\)')).toBeNull();
  });

  it('marks a failure with the destructive token instead of the success one', () => {
    const { container } = render(
      <SaveStatusIndicator status="error" label="Couldn't save" />
    );

    expect(
      container.querySelector('.text-\\(--destructive\\)')
    ).toBeInTheDocument();
    expect(container.querySelector('.text-\\(--success\\)')).toBeNull();
  });

  it('fades a transient success away', () => {
    render(<SaveStatusIndicator status="saved" label="Saved" transient />);

    expect(containerFor('Saved')).toHaveClass('animate-fade-out');
  });

  it.each<SaveStatus>(['pending', 'saving', 'error'])(
    'keeps the %s state on screen even when the success fade is enabled',
    (status) => {
      render(
        <SaveStatusIndicator
          status={status}
          label={`${status} copy`}
          transient
        />
      );

      expect(containerFor(`${status} copy`)).not.toHaveClass(
        'animate-fade-out'
      );
    }
  );
});
