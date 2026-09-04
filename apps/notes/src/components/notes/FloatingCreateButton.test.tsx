import type { ComponentProps, ReactNode } from 'react';

import { MOBILE_FAB_SLOT_ID } from '@/components/layout/MobileFabRail';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FloatingCreateButton } from './FloatingCreateButton';

const aiState = { aiEnabled: false, voiceNotesEnabled: false };

vi.mock('@/stores/ai.store', () => ({
  useAIStore: (selector: (s: typeof aiState) => unknown) => selector(aiState),
}));
vi.mock('@/components/voice-note/VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: () => <button type="button">voice-note-recorder</button>,
}));
vi.mock('@/lib/preload-editor', () => ({
  preloadEditorChunk: vi.fn(),
}));
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      children,
      ...rest
    }: ComponentProps<'div'> & Record<string, unknown>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

describe('FloatingCreateButton', () => {
  let slot: HTMLDivElement;

  beforeEach(() => {
    aiState.aiEnabled = false;
    aiState.voiceNotesEnabled = false;
    slot = document.createElement('div');
    slot.id = MOBILE_FAB_SLOT_ID;
    document.body.appendChild(slot);
  });

  afterEach(() => {
    cleanup();
    slot.remove();
  });

  it('always offers the create button', () => {
    render(<FloatingCreateButton onCreateNote={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Create new note' })
    ).toBeInTheDocument();
  });

  it('offers the voice recorder when AI and voice notes are both enabled', () => {
    aiState.aiEnabled = true;
    aiState.voiceNotesEnabled = true;

    render(<FloatingCreateButton onCreateNote={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'voice-note-recorder' })
    ).toBeInTheDocument();
  });

  it('hides the voice recorder when voice notes are disabled', () => {
    aiState.aiEnabled = true;
    aiState.voiceNotesEnabled = false;

    render(<FloatingCreateButton onCreateNote={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'voice-note-recorder' })
    ).not.toBeInTheDocument();
  });

  it('hides the voice recorder when AI is disabled', () => {
    aiState.aiEnabled = false;
    aiState.voiceNotesEnabled = true;

    render(<FloatingCreateButton onCreateNote={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'voice-note-recorder' })
    ).not.toBeInTheDocument();
  });
});
