import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export interface UploadedImageResult {
  src: string;
  width: number | null;
  height: number | null;
  alt: string;
}

export type ImageUploadProvider = (
  file: File,
  signal: AbortSignal
) => Promise<UploadedImageResult>;

export interface ImageUploadOptions {
  provider: ImageUploadProvider | null;
  onError: (error: unknown) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageUpload: {
      uploadImageFile: (file: File) => ReturnType;
    };
  }
}

export function extractImageFiles(files: ArrayLike<File>): File[] {
  return Array.from(files).filter((file) =>
    (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)
  );
}

interface PlaceholderSpec {
  id?: symbol;
}

const imageUploadKey = new PluginKey<DecorationSet>('imageUpload');

interface PlaceholderMeta {
  add?: { id: symbol; pos: number };
  remove?: { id: symbol };
}

function createPlaceholder(): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'my-2 flex items-center gap-2 rounded-md border border-(--border) bg-(--muted) px-3 py-2 text-sm text-(--muted-foreground)';
  el.setAttribute('data-image-uploading', '');
  el.textContent = 'Subiendo imagen…';
  return el;
}

const matchesId =
  (id: symbol | undefined) =>
  (spec: PlaceholderSpec): boolean =>
    spec.id === id;

function startUpload(
  editor: Editor,
  options: ImageUploadOptions,
  file: File,
  pos: number
): void {
  if (!options.provider) {
    return;
  }
  const id = Symbol('upload');
  const controller = new AbortController();

  const tr = editor.state.tr.setMeta(imageUploadKey, {
    add: { id, pos },
  } satisfies PlaceholderMeta);
  editor.view.dispatch(tr);

  options
    .provider(file, controller.signal)
    .then((result) => {
      const decos = imageUploadKey.getState(editor.state);
      const found = decos?.find(undefined, undefined, matchesId(id));
      const at = found && found.length ? found[0].from : null;

      const cleanup = editor.state.tr.setMeta(imageUploadKey, {
        remove: { id },
      } satisfies PlaceholderMeta);
      editor.view.dispatch(cleanup);

      if (at === null) {
        return;
      }
      editor
        .chain()
        .insertContentAt(at, {
          type: 'image',
          attrs: {
            src: result.src,
            alt: result.alt,
            width: result.width,
            height: result.height,
          },
        })
        .run();
    })
    .catch((error: unknown) => {
      const cleanup = editor.state.tr.setMeta(imageUploadKey, {
        remove: { id },
      } satisfies PlaceholderMeta);
      editor.view.dispatch(cleanup);
      options.onError(error);
    });
}

export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: 'imageUpload',

  addOptions() {
    return {
      provider: null,
      onError: () => undefined,
    };
  },

  addCommands() {
    return {
      uploadImageFile: (file: File) => () => {
        startUpload(
          this.editor,
          this.options,
          file,
          this.editor.state.selection.from
        );
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;

    return [
      new Plugin<DecorationSet>({
        key: imageUploadKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            // Placeholder lives only in this local DecorationSet, never in the
            // doc, so it never syncs to collaborators through Yjs.
            let next = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(imageUploadKey) as
              | PlaceholderMeta
              | undefined;
            if (meta?.add) {
              const spec: PlaceholderSpec & { side: number } = {
                id: meta.add.id,
                side: -1,
              };
              const widget = Decoration.widget(
                meta.add.pos,
                createPlaceholder,
                spec
              );
              next = next.add(tr.doc, [widget]);
            }
            if (meta?.remove) {
              next = next.remove(
                next.find(undefined, undefined, matchesId(meta.remove.id))
              );
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            return imageUploadKey.getState(state);
          },
          handlePaste(view, event) {
            const files = event.clipboardData?.files;
            const images = files ? extractImageFiles(files) : [];
            if (images.length === 0) {
              return false;
            }
            event.preventDefault();
            const pos = view.state.selection.from;
            images.forEach((file) => startUpload(editor, options, file, pos));
            return true;
          },
          handleDrop(view, event) {
            const files = (event as DragEvent).dataTransfer?.files;
            const images = files ? extractImageFiles(files) : [];
            if (images.length === 0) {
              return false;
            }
            event.preventDefault();
            const coords = view.posAtCoords({
              left: (event as DragEvent).clientX,
              top: (event as DragEvent).clientY,
            });
            const pos = coords?.pos ?? view.state.selection.from;
            images.forEach((file) => startUpload(editor, options, file, pos));
            return true;
          },
        },
      }),
    ];
  },
});
