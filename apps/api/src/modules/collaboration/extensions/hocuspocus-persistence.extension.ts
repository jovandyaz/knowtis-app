import type { Extension } from '@hocuspocus/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';

import {
  isTrivialFragment,
  YJS_XML_FRAGMENT_NAME,
} from '@knowtis/editor-schema';

import { NOTE_REPOSITORY } from '../../notes/domain';
import type { NoteRepository } from '../../notes/domain';
import { yDocToHtml } from '../../notes/infrastructure/html-to-yjs';
import { isTrivialHtml } from '../../notes/infrastructure/trivial-html';

@Injectable()
export class HocuspocusPersistenceExtension {
  private readonly logger = new Logger(HocuspocusPersistenceExtension.name);

  constructor(
    @Inject(NOTE_REPOSITORY)
    private readonly noteRepository: NoteRepository
  ) {}

  toExtension(): Extension {
    const noteRepository = this.noteRepository;
    const logger = this.logger;

    return {
      priority: 1000,
      extensionName: 'KnowtisPersistence',

      async onLoadDocument({ documentName }) {
        const note = await noteRepository.findById(documentName);
        if (!note?.yjsState) {
          return null;
        }

        const doc = new Y.Doc();
        try {
          Y.applyUpdate(doc, new Uint8Array(note.yjsState));
        } catch (error) {
          logger.error(
            `Failed to hydrate Y.Doc for note ${documentName}`,
            error instanceof Error ? error.stack : error
          );
          doc.destroy();
          return null;
        }
        return doc;
      },

      async onStoreDocument({ document, documentName }) {
        // Guard: refuse to overwrite non-trivial stored content with a trivial
        // live Y.Doc. This prevents the CRDT layer from clobbering REST-side
        // updates with empty initial state when a fresh client connects before
        // hydration completes.
        const fragment = document.getXmlFragment(YJS_XML_FRAGMENT_NAME);
        if (isTrivialFragment(fragment)) {
          const note = await noteRepository
            .findById(documentName)
            .catch((error) => {
              logger.warn(
                `onStoreDocument guard: findById failed for note ${documentName}, failing open`,
                error instanceof Error ? error.stack : error
              );
              return null;
            });
          if (note && !isTrivialHtml(note.content)) {
            logger.warn(
              `Skipping persistence of trivial Y.Doc over non-trivial content for note ${documentName}`
            );
            return;
          }
        }

        const buffer = Buffer.from(Y.encodeStateAsUpdate(document));

        let html: string;
        try {
          html = yDocToHtml(document);
        } catch (error) {
          // Never drop the edit: if HTML derivation fails, persist yjsState only.
          logger.warn(
            `yDocToHtml failed for note ${documentName}, persisting yjsState only`,
            error instanceof Error ? error.stack : error
          );
          const fallback = await noteRepository.updateYjsState(
            documentName,
            buffer
          );
          if (fallback.isErr()) {
            logger.error(
              `Failed to persist Y.Doc state for note ${documentName}: ${fallback.error.message}`
            );
          }
          return;
        }

        const result = await noteRepository.updateContentWithYjsState(
          documentName,
          { content: html },
          buffer
        );
        if (result.isErr()) {
          logger.error(
            `Failed to persist content+yjsState for note ${documentName}: ${result.error.message}`
          );
        }
      },
    };
  }
}
