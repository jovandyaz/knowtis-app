import { asc, gt } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import * as Y from 'yjs';

import { IMAGE_NODE_NAME, YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';
import { isStoredImageUrl } from '@knowtis/shared-util';

import type { Database } from '../database/database.module';
import { notes } from '../database/schema/notes.schema';
import { SRC_ATTR } from '../modules/notes/infrastructure/html-to-yjs';

export const AUDIT_BATCH_SIZE = 100;

export const SAME_ORIGIN_SRC = '(same origin)';
export const INVALID_SRC = '(invalid URL)';

// A reserved TLD no stored src can name, so a src that resolves to it is a
// relative one, fetched from whichever page renders the note.
const PAGE_ORIGIN = 'https://page.invalid';

export interface NoteImageState {
  readonly id: string;
  readonly content: string;
  readonly yjsState: Buffer | null;
  readonly deletedAt: Date | null;
}

export interface NoteImageStore {
  statesAfter(
    id: string | null,
    limit: number
  ): Promise<readonly NoteImageState[]>;
}

/** Hosts only: a foreign src's path and query may carry what it exfiltrates. */
export interface NoteForeignImages {
  readonly id: string;
  readonly inState: readonly string[];
  readonly inContent: readonly string[];
}

export interface UnreadableState {
  readonly id: string;
  readonly reason: string;
}

export interface ImageAuditReport {
  readonly scanned: number;
  readonly scannedInTrash: number;
  readonly foreign: readonly NoteForeignImages[];
  readonly foreignInTrash: readonly NoteForeignImages[];
  readonly unreadable: readonly UnreadableState[];
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function srcHost(src: string): string {
  if (!URL.canParse(src, PAGE_ORIGIN)) {
    return INVALID_SRC;
  }
  const url = new URL(src, PAGE_ORIGIN);
  if (url.origin === PAGE_ORIGIN) {
    return SAME_ORIGIN_SRC;
  }
  return url.host || url.protocol;
}

function foreignHosts(srcs: readonly unknown[]): string[] {
  const hosts = srcs.flatMap((src) =>
    typeof src === 'string' && src !== '' && !isStoredImageUrl(src)
      ? [srcHost(src)]
      : []
  );
  return [...new Set(hosts)];
}

// Rendering omits a foreign src, so the state's attributes are the only record of it.
function imageSrcsInState(state: Buffer): unknown[] {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, new Uint8Array(state));
    const images = doc
      .getXmlFragment(YJS_XML_FRAGMENT_NAME)
      .createTreeWalker(
        (node) =>
          node instanceof Y.XmlElement && node.nodeName === IMAGE_NODE_NAME
      );
    return [...images].flatMap((image) =>
      image instanceof Y.XmlElement ? [image.getAttribute(SRC_ATTR)] : []
    );
  } finally {
    doc.destroy();
  }
}

function imageSrcsInHtml(html: string): unknown[] {
  const srcs: unknown[] = [];
  sanitizeHtml(html, {
    onOpenTag: (tag, attribs) => {
      if (tag === 'img') {
        srcs.push(attribs[SRC_ATTR]);
      }
    },
  });
  return srcs;
}

/** Lists, without writing anything, every note whose CRDT state or `content` embeds an image the app did not store. */
export async function auditNoteImages(
  store: NoteImageStore
): Promise<ImageAuditReport> {
  let scanned = 0;
  let scannedInTrash = 0;
  const foreign: NoteForeignImages[] = [];
  const foreignInTrash: NoteForeignImages[] = [];
  const unreadable: UnreadableState[] = [];

  let after: string | null = null;
  for (;;) {
    const batch = await store.statesAfter(after, AUDIT_BATCH_SIZE);
    const last = batch.at(-1);
    if (!last) {
      break;
    }
    for (const note of batch) {
      const trashed = note.deletedAt !== null;
      scanned += 1;
      scannedInTrash += trashed ? 1 : 0;

      let stateSrcs: unknown[] = [];
      if (note.yjsState && note.yjsState.length > 0) {
        try {
          stateSrcs = imageSrcsInState(note.yjsState);
        } catch (error) {
          unreadable.push({ id: note.id, reason: reasonOf(error) });
        }
      }
      const found: NoteForeignImages = {
        id: note.id,
        inState: foreignHosts(stateSrcs),
        inContent: foreignHosts(imageSrcsInHtml(note.content)),
      };
      if (found.inState.length > 0 || found.inContent.length > 0) {
        (trashed ? foreignInTrash : foreign).push(found);
      }
    }
    after = last.id;
  }

  return { scanned, scannedInTrash, foreign, foreignInTrash, unreadable };
}

export function drizzleNoteImageStore(db: Database): NoteImageStore {
  return {
    async statesAfter(id, limit) {
      return db
        .select({
          id: notes.id,
          content: notes.content,
          yjsState: notes.yjsState,
          deletedAt: notes.deletedAt,
        })
        .from(notes)
        .where(id === null ? undefined : gt(notes.id, id))
        .orderBy(asc(notes.id))
        .limit(limit);
    },
  };
}
