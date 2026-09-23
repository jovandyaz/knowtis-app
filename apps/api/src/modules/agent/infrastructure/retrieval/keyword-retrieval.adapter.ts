import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { htmlToMarkdown } from '@knowtis/note-markdown';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { NoteEntity } from '../../../notes/domain/entities/note.entity';
import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../../../notes/domain/ports/note-read.repository';
import { yjsStateToHtml } from '../../../notes/infrastructure/html-to-yjs';
import { InjectionGuardService } from '../../application/injection-guard.service';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import {
  MAX_NOTE_CONTENT_CHARS,
  TRUNCATION_MARKER,
  type AgentNote,
  type NoteBody,
  type NoteContentStatus,
  type NoteHit,
  type NotesOverview,
} from '../../domain/retrieval';
import { htmlToPlainText } from '../sanitize/html-sanitizer';
import { toNoteHit } from './note-hit.mapper';

const MAX_SEARCH_HITS = 20;
const WITHHELD_CONTENT =
  '[Note content withheld: it failed the injection safety check]';

interface BoundedText {
  readonly text: string;
  readonly truncated: boolean;
}

interface ToolContent {
  readonly content: string;
  readonly contentStatus: NoteContentStatus;
}

@Injectable()
export class KeywordRetrievalAdapter implements RetrievalPort {
  private readonly logger = new Logger(KeywordRetrievalAdapter.name);

  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepository: NoteReadRepository,
    private readonly featureFlags: FeatureFlagsService,
    private readonly injectionGuard: InjectionGuardService
  ) {}

  async search(userId: string, query: string): Promise<NoteHit[]> {
    const branded = this.brandUser(userId, 'search');
    if (!branded) {
      return [];
    }
    const summaries =
      await this.noteReadRepository.findAccessibleSummariesByUser(
        branded,
        query
      );
    return summaries
      .slice(0, MAX_SEARCH_HITS)
      .map((note) => toNoteHit(note, userId));
  }

  async listUnindexed(): Promise<NoteHit[]> {
    return [];
  }

  async getById(userId: string, noteId: string): Promise<AgentNote | null> {
    const branded = this.brandUser(userId, 'getById');
    if (!branded) {
      return null;
    }
    const note = await this.noteReadRepository.findByIdForUser(noteId, branded);
    if (!note) {
      return null;
    }
    const html = this.currentBody(note, 'getById') ?? note.content;
    return {
      ...toNoteHit(note, userId),
      ...(await this.toToolContent(html, userId, note.id)),
      createdAt: note.createdAt.toISOString(),
    };
  }

  async getBody(userId: string, noteId: string): Promise<NoteBody | null> {
    const branded = this.brandUser(userId, 'getBody');
    if (!branded) {
      return null;
    }
    const note = await this.noteReadRepository.findByIdForUser(noteId, branded);
    if (!note) {
      return null;
    }
    return {
      title: note.title,
      html: this.currentBody(note, 'getBody'),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  async listRecent(userId: string, limit: number): Promise<NoteHit[]> {
    const branded = this.brandUser(userId, 'listRecent');
    if (!branded) {
      return [];
    }
    const clampedLimit = Math.min(Math.max(limit, 1), MAX_SEARCH_HITS);
    const summaries =
      await this.noteReadRepository.findAccessibleSummariesByUser(branded);
    return summaries
      .slice(0, clampedLimit)
      .map((note) => toNoteHit(note, userId));
  }

  async overview(userId: string): Promise<NotesOverview> {
    const branded = this.brandUser(userId, 'overview');
    if (!branded) {
      return { total: 0, owned: 0, sharedWithMe: 0 };
    }
    const { total, owned } =
      await this.noteReadRepository.countAccessibleByUser(branded);
    return { total, owned, sharedWithMe: total - owned };
  }

  private currentBody(note: NoteEntity, op: string): string | null {
    if (!note.yjsState || note.yjsState.byteLength === 0) {
      return note.content;
    }
    try {
      return yjsStateToHtml(note.yjsState);
    } catch {
      // ProseMirror errors can quote note text, so only the id is logged.
      this.logger.error({
        event: 'agent.retrieval.state_render_failed',
        noteId: note.id,
        op,
      });
      return null;
    }
  }

  private async toToolContent(
    html: string,
    userId: string,
    noteId: string
  ): Promise<ToolContent> {
    const markdown = this.bound(htmlToMarkdown(html));
    if (await this.scanFlagOn()) {
      // The heuristics match instruction phrases as contiguous text, so one
      // emphasised word inside a phrase hides it from a Markdown scan; the
      // plain text drops href values, hiding an exfiltration link from a
      // plain-text scan. Neither view covers the other.
      const plain = this.bound(htmlToPlainText(html));
      const views =
        plain.text === markdown.text
          ? [markdown.text]
          : [markdown.text, plain.text];
      for (const text of views) {
        const verdict = await this.injectionGuard.guard(text, userId);
        if (!verdict.safe) {
          this.logger.warn({
            event: 'agent.retrieval.content_blocked',
            noteId,
            score: verdict.score,
          });
          return { content: WITHHELD_CONTENT, contentStatus: 'withheld' };
        }
      }
    }
    return {
      content: markdown.text,
      contentStatus: markdown.truncated ? 'truncated' : 'complete',
    };
  }

  private bound(text: string): BoundedText {
    return text.length <= MAX_NOTE_CONTENT_CHARS
      ? { text, truncated: false }
      : {
          text: `${text.slice(0, MAX_NOTE_CONTENT_CHARS).replace(/[\uD800-\uDBFF]$/, '')}${TRUNCATION_MARKER}`,
          truncated: true,
        };
  }

  private async scanFlagOn(): Promise<boolean> {
    try {
      return await this.featureFlags.isEnabled(
        FEATURE_FLAG_KEYS.AGENT_SCAN_RETRIEVED_NOTES
      );
    } catch (error) {
      this.logger.warn(
        `Scan flag lookup failed, treating as off: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return false;
    }
  }

  private brandUser(userId: string, op: string): UserId | null {
    const branded = UserId.create(userId);
    if (branded.isErr()) {
      this.logger.warn(`Invalid userId for retrieval ${op}: ${userId}`);
      return null;
    }
    return branded.value;
  }
}
