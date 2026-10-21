import { useAnonymousLimitStore } from '@/stores/anonymous-limit.store';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import { ANONYMOUS_NOTE_LIMIT_CODE } from '@knowtis/shared-types';

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

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

async function createNoteFromResult() {
  const user = userEvent.setup();
  render(<VoiceNoteRecorder />);
  await user.click(
    screen.getByRole('button', { name: 'ai.voice.recordVoiceNote' })
  );
  await user.click(
    await screen.findByRole('button', { name: 'ai.voice.createNote' })
  );
}

function failCreate(error: unknown) {
  const [, options] = createNoteMutate.mock.calls[0] as [
    unknown,
    { onError: (error: unknown) => void },
  ];
  act(() => options.onError(error));
}

describe('VoiceNoteRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnonymousLimitStore.setState({ showModal: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('offers the guest-limit dialog when a guest is past the note limit', async () => {
    await createNoteFromResult();

    failCreate(
      new ApiClientError(
        'Guest note limit reached',
        403,
        ANONYMOUS_NOTE_LIMIT_CODE
      )
    );

    expect(useAnonymousLimitStore.getState().showModal).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports any other failure in its own words, not the server message', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failure = new ApiClientError('Internal server error', 500);
    await createNoteFromResult();

    failCreate(failure);

    expect(consoleError).toHaveBeenCalledWith(
      '[VoiceNoteRecorder] Failed to create note:',
      failure
    );
    expect(toast.error).toHaveBeenCalledWith('create.failedToCreate');
    expect(useAnonymousLimitStore.getState().showModal).toBe(false);
  });
});
