import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VoiceNoteRecorder } from './VoiceNoteRecorder';

const TITLE = 'Weekly sync';
const TRANSCRIBED = 'Transcribed idea';
const FOREIGN_IMAGE = 'https://evil.com/p.png';
const createNoteMutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks', () => ({
  useVoiceRecorder: () => ({
    isSupported: true,
    state: 'idle',
    audioBlob: null,
    start: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
  }),
  useVoiceNote: () => ({
    mutate: vi.fn(),
    isIdle: false,
    isSuccess: true,
    isError: false,
    isPending: false,
    data: {
      title: TITLE,
      content: `<p>${TRANSCRIBED}</p><figure data-image><img src="${FOREIGN_IMAGE}"></figure>`,
    },
    reset: vi.fn(),
  }),
}));

vi.mock('@knowtis/data-access-notes', () => ({
  useCreateNote: () => ({ mutate: createNoteMutate, isPending: false }),
}));

describe('VoiceNoteRecorder', () => {
  it('creates the note without the images the model put in it', async () => {
    const user = userEvent.setup();
    render(<VoiceNoteRecorder />);

    await user.click(
      screen.getByRole('button', { name: 'ai.voice.recordVoiceNote' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'ai.voice.createNote' })
    );

    expect(createNoteMutate).toHaveBeenCalledTimes(1);
    expect(createNoteMutate.mock.calls[0][0]).toEqual({
      title: TITLE,
      content: `<p>${TRANSCRIBED}</p>`,
    });
  });
});
