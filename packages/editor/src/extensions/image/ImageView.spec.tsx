import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnyExtension, Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';

import { IMAGE_NODE_NAME } from '@knowtis/editor-schema';

import { ReadOnlyEditor } from '../../components/ReadOnlyEditor';
import { createBaseExtensions } from '../base-extensions';
import type { UploadedImageResult } from './image-upload';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const STORED_IMAGE =
  'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/chart.webp';
const FOREIGN_IMAGES = [
  'https://evil.com/p.png',
  'https://attacker123.public.blob.vercel-storage.com/x.png',
  'http://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/chart.webp',
  '/t/x.png',
  'data:image/png;base64,AAAA',
];
const ALT = 'chart';

function figure(src: string): string {
  return `<figure data-image><img src="${src}" alt="${ALT}"></figure><p>after</p>`;
}

function EditableNote({
  content,
  onCreate,
  extensions = createBaseExtensions({ disableHistory: true }),
}: {
  content: string;
  onCreate: (editor: Editor) => void;
  extensions?: AnyExtension[];
}) {
  const editor = useEditor({
    extensions,
    content,
    editable: true,
    onCreate: ({ editor: created }) => onCreate(created),
  });
  return <EditorContent editor={editor} />;
}

function pasteHtml(editor: Editor, html: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? html : ''),
      types: ['text/html'],
      files: [],
    },
  });
  act(() => {
    editor.view.dom.dispatchEvent(event);
  });
}

function imageNodes(editor: Editor): string[] {
  const sources: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === IMAGE_NODE_NAME) {
      sources.push(String(node.attrs['src']));
    }
  });
  return sources;
}

describe('ImageView', () => {
  it('renders an image stored in the app blob store', async () => {
    const { container } = render(
      <ReadOnlyEditor content={figure(STORED_IMAGE)} />
    );

    await screen.findByRole('img', { name: ALT });
    expect(
      [...container.querySelectorAll('img')].map((img) =>
        img.getAttribute('src')
      )
    ).toEqual([STORED_IMAGE]);
    expect(screen.queryByText('ai.image.unavailable')).toBeNull();
  });

  it.each(FOREIGN_IMAGES)(
    'renders no image element for %s, only the unavailable placeholder',
    async (src) => {
      const { container } = render(<ReadOnlyEditor content={figure(src)} />);

      await screen.findByText('ai.image.unavailable');
      expect(container.querySelector('img')).toBeNull();
    }
  );

  it('keeps the controls of a blocked image so the user can delete it', async () => {
    const user = userEvent.setup();
    let editor: Editor | undefined;
    render(
      <EditableNote
        content={figure(FOREIGN_IMAGES[0])}
        onCreate={(created) => {
          editor = created;
        }}
      />
    );
    await screen.findByText('ai.image.unavailable');
    if (!editor) {
      throw new Error('editor was not created');
    }
    const live = editor;
    expect(imageNodes(live)).toEqual([FOREIGN_IMAGES[0]]);

    live.commands.setNodeSelection(0);
    expect(
      await screen.findByRole('button', { name: 'ai.image.editAlt' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ai.image.delete' }));

    expect(imageNodes(live)).toEqual([]);
    expect(live.getText()).toContain('after');
  });

  it('shows an importing label while a pasted image is imported, then the stored image', async () => {
    let finishImport: (result: UploadedImageResult) => void = () => undefined;
    const importProvider = () =>
      new Promise<UploadedImageResult>((resolve) => {
        finishImport = resolve;
      });
    let editor: Editor | undefined;
    render(
      <EditableNote
        content="<p>before</p>"
        extensions={createBaseExtensions({
          disableHistory: true,
          imageImport: { importProvider },
        })}
        onCreate={(created) => {
          editor = created;
        }}
      />
    );
    await screen.findByText('before');
    if (!editor) {
      throw new Error('editor was not created');
    }
    pasteHtml(editor, `<img src="${FOREIGN_IMAGES[0]}" alt="${ALT}">`);

    expect(await screen.findByText('ai.image.importing')).toBeInTheDocument();
    expect(screen.queryByText('ai.image.unavailable')).toBeNull();

    await act(async () => {
      finishImport({ src: STORED_IMAGE, width: null, height: null, alt: '' });
    });

    expect(
      (await screen.findByRole('img', { name: ALT })).getAttribute('src')
    ).toBe(STORED_IMAGE);
    expect(screen.queryByText('ai.image.importing')).toBeNull();
  });
});
