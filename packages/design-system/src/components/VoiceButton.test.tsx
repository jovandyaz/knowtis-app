import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VoiceButton } from './VoiceButton';

describe('VoiceButton', () => {
  it('fills an idle button with the primary colour by default', () => {
    render(<VoiceButton />);
    const button = screen.getByRole('button', { name: 'Start recording' });
    expect(button.className).toContain('bg-(--primary)');
    expect(button.className).toContain('text-(--primary-foreground)');
  });

  it('demotes an idle button to a surface fill when emphasis is quiet', () => {
    render(<VoiceButton emphasis="quiet" />);
    const button = screen.getByRole('button', { name: 'Start recording' });
    expect(button.className).toContain('bg-(--card)');
    expect(button.className).toContain('text-(--primary)');
    expect(button.className).toContain('border-(--border)');
    expect(button.className).not.toContain('bg-(--primary)');
  });

  it('keeps the listening state loud regardless of emphasis', () => {
    render(<VoiceButton state="listening" emphasis="quiet" />);
    const button = screen.getByRole('button', { name: 'Stop recording' });
    expect(button.className).toContain('bg-red-500');
    expect(button.className).toContain('animate-pulse');
    expect(button.className).not.toContain('bg-(--card)');
  });

  it('keeps the paused state loud regardless of emphasis', () => {
    render(<VoiceButton state="paused" emphasis="quiet" />);
    const button = screen.getByRole('button', { name: 'Resume recording' });
    expect(button.className).toContain('bg-amber-500');
    expect(button.className).not.toContain('bg-(--card)');
  });

  it('keeps the tap target at 56px for the lg size in either emphasis', () => {
    const { rerender } = render(<VoiceButton size="lg" />);
    expect(screen.getByRole('button').className).toContain('size-14');

    rerender(<VoiceButton size="lg" emphasis="quiet" />);
    expect(screen.getByRole('button').className).toContain('size-14');
  });

  it('keeps the md size above the 44px tap-target floor', () => {
    render(<VoiceButton size="md" emphasis="quiet" />);
    expect(screen.getByRole('button').className).toContain('size-12');
  });

  it('disables the button while processing', () => {
    render(<VoiceButton state="processing" emphasis="quiet" />);
    expect(
      screen.getByRole('button', { name: 'Processing audio' })
    ).toBeDisabled();
  });
});
