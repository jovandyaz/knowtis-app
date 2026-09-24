import type { Editor } from '@tiptap/core';
import { Extension, getChangedRanges } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';

import { IMAGE_NODE_NAME } from '@knowtis/editor-schema';
import { generateId, isStoredImageUrl, logger } from '@knowtis/shared-util';

import type { ImageUploadProvider, UploadedImageResult } from './image-upload';
import {
  PASTED_IMAGE_SCHEMES,
  PENDING_IMAGE_SCHEME,
  type DataImageHandler,
} from './pasted-image-html';

/**
 * Transaction meta that marks content a command inserts on the user's behalf
 * (a paste it handles itself), so its images are imported like a native paste.
 */
export const IMAGE_INSERT_META = 'imageInsert';

export const MAX_PARALLEL_IMPORTS = 3;

const INSERT_UI_EVENTS: readonly unknown[] = ['paste', 'drop'];
const LINK_MARK_NAME = 'link';
const PARAGRAPH_NODE_NAME = 'paragraph';
const MISSING_FILE_ERROR = 'The pasted image file is no longer available';

export type ImageImportProvider = (
  url: string,
  signal: AbortSignal
) => Promise<UploadedImageResult>;

export interface ImageImportOptions {
  /** Re-hosts a pasted `http(s)` image; without it such images stay as they are. */
  importProvider?: ImageImportProvider;
  /** Uploads a pasted `data:` image; without it such images are dropped on paste. */
  uploadProvider?: ImageUploadProvider;
  /** Called once per paste with the number of images that could not be imported. */
  onImportFailed?: (count: number) => void;
}

interface ImageImportConfig extends ImageImportOptions {
  pendingFiles: Map<string, File>;
}

interface ImageImporter {
  sync: () => void;
  destroy: () => void;
}

interface ImageImportStorage {
  importer: ImageImporter | null;
}

interface Batch {
  remaining: number;
  failed: number;
}

interface ImportJob {
  src: string;
  file: File | undefined;
  batch: Batch;
}

interface ImagePosition {
  node: ProseMirrorNode;
  pos: number;
}

const NO_IMPORTS: ReadonlySet<string> = new Set();

const imageImportKey = new PluginKey<ReadonlySet<string>>('imageImport');

/** Whether an image with this src is being imported into the note. */
export function isImageImportPending(state: EditorState, src: string): boolean {
  return imageImportKey.getState(state)?.has(src) ?? false;
}

function isRemoteImageUrl(src: string): boolean {
  try {
    return (PASTED_IMAGE_SCHEMES as readonly string[]).includes(
      new URL(src).protocol
    );
  } catch {
    return false;
  }
}

function isPendingImage(src: string): boolean {
  return src.startsWith(PENDING_IMAGE_SCHEME);
}

function imageSrc(node: ProseMirrorNode): string {
  const src = node.attrs['src'];
  return node.type.name === IMAGE_NODE_NAME && typeof src === 'string'
    ? src
    : '';
}

function imageSources(doc: ProseMirrorNode): Set<string> {
  const sources = new Set<string>();
  doc.descendants((node) => {
    const src = imageSrc(node);
    if (src) {
      sources.add(src);
    }
  });
  return sources;
}

function hasInsertIntent(tr: Transaction): boolean {
  return (
    INSERT_UI_EVENTS.includes(tr.getMeta('uiEvent')) ||
    tr.getMeta(IMAGE_INSERT_META) === true
  );
}

// ProseMirror tags a drag-move inside the note as a `drop` too; its image was
// already in the document, so only srcs new to the document count as pasted.
function pastedSources(
  tr: Transaction,
  importable: (src: string) => boolean
): string[] {
  if (!tr.docChanged || !hasInsertIntent(tr)) {
    return [];
  }
  const inserted = new Set<string>();
  for (const { newRange } of getChangedRanges(tr)) {
    tr.doc.nodesBetween(newRange.from, newRange.to, (node) => {
      const src = imageSrc(node);
      if (src && importable(src)) {
        inserted.add(src);
      }
    });
  }
  if (inserted.size === 0) {
    return [];
  }
  const existing = imageSources(tr.before);
  return [...inserted].filter((src) => !existing.has(src));
}

function createImportStatePlugin(
  options: ImageImportOptions
): Plugin<ReadonlySet<string>> {
  const importable = (src: string): boolean =>
    isPendingImage(src)
      ? options.uploadProvider !== undefined
      : options.importProvider !== undefined &&
        isRemoteImageUrl(src) &&
        !isStoredImageUrl(src);

  return new Plugin<ReadonlySet<string>>({
    key: imageImportKey,
    state: {
      init: () => NO_IMPORTS,
      apply(tr, pending) {
        let next = pending;
        const settled: unknown = tr.getMeta(imageImportKey);
        if (typeof settled === 'string' && next.has(settled)) {
          const rest = new Set(next);
          rest.delete(settled);
          next = rest;
        }
        const pasted = pastedSources(tr, importable);
        return pasted.length > 0 ? new Set([...next, ...pasted]) : next;
      },
    },
  });
}

function imagesWithSrc(doc: ProseMirrorNode, src: string): ImagePosition[] {
  const found: ImagePosition[] = [];
  doc.descendants((node, pos) => {
    if (imageSrc(node) === src) {
      found.push({ node, pos });
    }
  });
  return found;
}

function swapInStoredImage(
  tr: Transaction,
  src: string,
  result: UploadedImageResult
): number {
  const images = imagesWithSrc(tr.doc, src);
  for (const { node, pos } of images) {
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      src: result.src,
      ...(result.width !== null && { width: result.width }),
      ...(result.height !== null && { height: result.height }),
    });
  }
  return images.length;
}

function linkParagraph(
  tr: Transaction,
  node: ProseMirrorNode,
  url: string
): ProseMirrorNode | undefined {
  const { schema } = tr.doc.type;
  const alt = node.attrs['alt'];
  const label = (typeof alt === 'string' && alt.trim()) || url;
  const link = schema.marks[LINK_MARK_NAME];
  return schema.nodes[PARAGRAPH_NODE_NAME]?.create(
    null,
    schema.text(label, link ? [link.create({ href: url })] : [])
  );
}

function replaceWithFallback(tr: Transaction, src: string): number {
  const images = imagesWithSrc(tr.doc, src).reverse();
  for (const { node, pos } of images) {
    const paragraph = isPendingImage(src)
      ? undefined
      : linkParagraph(tr, node, src);
    if (paragraph) {
      tr.replaceWith(pos, pos + node.nodeSize, paragraph);
    } else {
      tr.delete(pos, pos + node.nodeSize);
    }
  }
  return images.length;
}

function createImporter(
  editor: Editor,
  options: ImageImportConfig
): ImageImporter {
  let known: ReadonlySet<string> = NO_IMPORTS;
  let destroyed = false;
  const queue: ImportJob[] = [];
  const running = new Set<AbortController>();

  async function load(
    job: ImportJob,
    signal: AbortSignal
  ): Promise<UploadedImageResult> {
    if (!isPendingImage(job.src) && options.importProvider) {
      return options.importProvider(job.src, signal);
    }
    if (job.file && options.uploadProvider) {
      return options.uploadProvider(job.file, signal);
    }
    throw new Error(MISSING_FILE_ERROR);
  }

  function finish(
    job: ImportJob,
    controller: AbortController,
    outcome: (tr: Transaction) => number,
    failed: boolean
  ) {
    running.delete(controller);
    if (destroyed) {
      return;
    }
    const tr = editor.state.tr;
    const affected = outcome(tr);
    editor.view.dispatch(
      tr.setMeta(imageImportKey, job.src).setMeta('addToHistory', false)
    );
    job.batch.remaining -= 1;
    if (failed) {
      job.batch.failed += affected;
    }
    if (job.batch.remaining === 0 && job.batch.failed > 0) {
      options.onImportFailed?.(job.batch.failed);
    }
    pump();
  }

  function pump() {
    while (!destroyed && running.size < MAX_PARALLEL_IMPORTS) {
      const job = queue.shift();
      if (!job) {
        return;
      }
      const controller = new AbortController();
      running.add(controller);
      load(job, controller.signal).then(
        (result) =>
          finish(
            job,
            controller,
            (tr) => swapInStoredImage(tr, job.src, result),
            false
          ),
        (error: unknown) => {
          if (!destroyed) {
            logger.warn('Could not import a pasted image', {
              context: 'ImageImport',
              error,
            });
          }
          finish(
            job,
            controller,
            (tr) => replaceWithFallback(tr, job.src),
            true
          );
        }
      );
    }
  }

  return {
    sync() {
      const pending = imageImportKey.getState(editor.state) ?? NO_IMPORTS;
      if (destroyed || pending === known) {
        return;
      }
      const claimed = [...pending].filter((src) => !known.has(src));
      known = pending;
      if (claimed.length === 0) {
        return;
      }
      const batch: Batch = { remaining: claimed.length, failed: 0 };
      for (const src of claimed) {
        const file = options.pendingFiles.get(src);
        options.pendingFiles.delete(src);
        queue.push({ src, file, batch });
      }
      pump();
    },
    destroy() {
      destroyed = true;
      queue.length = 0;
      running.forEach((controller) => controller.abort());
      running.clear();
      options.pendingFiles.clear();
    },
  };
}

const ImageImport = Extension.create<ImageImportConfig, ImageImportStorage>({
  name: 'imageImport',

  addOptions() {
    return { pendingFiles: new Map() };
  },

  addStorage() {
    return { importer: null };
  },

  onBeforeCreate() {
    this.storage.importer = createImporter(this.editor, this.options);
  },

  onTransaction() {
    this.storage.importer?.sync();
  },

  onDestroy() {
    this.storage.importer?.destroy();
  },

  addProseMirrorPlugins() {
    return [createImportStatePlugin(this.options)];
  },
});

/**
 * Builds the extension that re-hosts the images a local paste or drop inserts,
 * plus the `onDataImage` hook the paste normalizers need to hand it pasted
 * `data:` images. The hook is only returned when there is an upload provider.
 */
export function createImageImport(options: ImageImportOptions): {
  extension: typeof ImageImport;
  onDataImage: DataImageHandler | undefined;
} {
  const pendingFiles = new Map<string, File>();
  const onDataImage: DataImageHandler = (file) => {
    const token = `${PENDING_IMAGE_SCHEME}${generateId()}`;
    pendingFiles.set(token, file);
    // A clipboard can carry one image both as a file and as HTML; the file
    // paste wins, so the token the HTML produced is never inserted.
    setTimeout(() => pendingFiles.delete(token), 0);
    return token;
  };
  return {
    extension: ImageImport.configure({ ...options, pendingFiles }),
    onDataImage: options.uploadProvider ? onDataImage : undefined,
  };
}
