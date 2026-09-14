import { useAIStore } from '@/stores/ai.store';
import type { Editor, Range } from '@tiptap/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { filterSlashCommands } from './slash-commands.config';

let pickFile: ((file: File) => void) | undefined;

vi.mock('../image/imagePicker', () => ({
  openImagePicker: (onPick: (file: File) => void) => {
    pickFile = onPick;
  },
}));

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('filterSlashCommands', () => {
  beforeEach(() => {
    useAIStore.setState({ voiceNotesEnabled: false });
  });

  it('offers the voice note command when voice notes are enabled', () => {
    useAIStore.setState({ voiceNotesEnabled: true });

    expect(ids(filterSlashCommands(''))).toContain('ai-voice-note');
    expect(ids(filterSlashCommands('voz'))).toEqual(['ai-voice-note']);
  });

  it('drops the voice note command when voice notes are disabled', () => {
    expect(ids(filterSlashCommands(''))).not.toContain('ai-voice-note');
    expect(filterSlashCommands('voz')).toEqual([]);
  });

  it('keeps the other AI and formatting commands regardless of the flag', () => {
    const items = ids(filterSlashCommands(''));

    expect(items).toContain('ai-continue');
    expect(items).toContain('heading-1');
  });

  it('returns a stable list for an empty query so the menu keeps its selection', () => {
    expect(filterSlashCommands('')).toBe(filterSlashCommands(''));
  });
});

describe('the image slash command', () => {
  function runImageCommand(editor: { isDestroyed: boolean }) {
    const chain = {
      focus: () => chain,
      deleteRange: () => chain,
      run: () => true,
    };
    const uploadImageFile = vi.fn();
    const fake = {
      ...editor,
      chain: () => chain,
      commands: { uploadImageFile },
    } as unknown as Editor;

    const image = filterSlashCommands('').find((item) => item.id === 'image');
    image?.action(fake, { from: 0, to: 0 } as Range);

    return { uploadImageFile, editor: fake };
  }

  it('uploads the file the reader picked', () => {
    const { uploadImageFile } = runImageCommand({ isDestroyed: false });

    pickFile?.(new File([''], 'diagram.png'));

    expect(uploadImageFile).toHaveBeenCalledTimes(1);
  });

  it('drops the upload when the editor went away while the picker was open', () => {
    const { uploadImageFile, editor } = runImageCommand({ isDestroyed: false });
    Object.assign(editor, { isDestroyed: true });

    pickFile?.(new File([''], 'diagram.png'));

    expect(uploadImageFile).not.toHaveBeenCalled();
  });
});
