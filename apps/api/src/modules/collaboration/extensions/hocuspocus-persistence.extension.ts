import type { Extension } from '@hocuspocus/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';

import { NOTE_REPOSITORY } from '../../notes/domain';
import type { NoteRepository } from '../../notes/domain';

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
        const state = Y.encodeStateAsUpdate(document);
        const result = await noteRepository.updateYjsState(
          documentName,
          Buffer.from(state)
        );

        if (result.isErr()) {
          logger.error(
            `Failed to persist Y.Doc state for note ${documentName}: ${result.error.message}`
          );
        }
      },
    };
  }
}
