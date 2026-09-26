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

const aiItems = (items: { group: string }[]) =>
  items.filter((item) => item.group === 'ai');

describe('filterSlashCommands', () => {
  beforeEach(() => {
    useAIStore.setState({ aiEnabled: true });
  });

  it('offers the voice note command when AI is on', () => {
    expect(ids(filterSlashCommands(''))).toContain('ai-voice-note');
    expect(ids(filterSlashCommands('voz'))).toEqual(['ai-voice-note']);
  });

  it('offers the other AI and formatting commands when AI is on', () => {
    const items = filterSlashCommands('');

    expect(aiItems(items)).not.toHaveLength(0);
    expect(ids(items)).toContain('ai-continue');
    expect(ids(items)).toContain('heading-1');
  });

  it('offers only the formatting commands when AI is off', () => {
    useAIStore.setState({ aiEnabled: false });

    const items = filterSlashCommands('');

    expect(aiItems(items)).toEqual([]);
    expect(ids(items)).toContain('heading-1');
    expect(filterSlashCommands('voz')).toEqual([]);
  });

  it.each([true, false])(
    'returns a stable list for an empty query so the menu keeps its selection (AI on: %s)',
    (aiEnabled) => {
      useAIStore.setState({ aiEnabled });

      expect(filterSlashCommands('')).toBe(filterSlashCommands(''));
    }
  );
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
