import { randomBytes } from 'node:crypto';

import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  GENERAL_ACCESS,
  type GeneralAccessLevel,
  type ParaBucket,
  type PermissionLevel,
  type Supertag,
  type SupertagFields,
} from '@knowtis/shared-types';
import { pickDefined } from '@knowtis/shared-util';

import { VerifiedIdentityPolicy } from '../../../users/verified-identity.policy';
import {
  linkExposureAfter,
  NOTE_REPOSITORY,
  NoteContent,
  NoteErrors,
  NoteTitle,
  SupertagAssignment,
  TAG_REPOSITORY,
  TagPath,
  widensLinkExposure,
  type NoteDomainError,
  type NoteEntity,
  type NoteRepository,
  type TagRepository,
  type UpdateNoteData,
} from '../../domain';
import {
  NoteUpdatedEvent,
  type NoteUpdatedEventUpdates,
} from '../../domain/events';
import {
  evolveYjsState,
  htmlToYjsState,
} from '../../infrastructure/html-to-yjs';
import { isTrivialHtml } from '../../infrastructure/trivial-html';
import { decodeYjsStateUpdate } from '../../infrastructure/yjs-state-update';

export interface UpdateNoteInput {
  readonly noteId: string;
  readonly userId: string;
  readonly title?: string;
  readonly content?: string;
  readonly generalAccess?: GeneralAccessLevel;
  readonly generalAccessPermission?: PermissionLevel;
  readonly editorsCanShare?: boolean;
  readonly force?: boolean;
  /**
   * The editor's own CRDT state, base64-encoded. When present it is stored
   * verbatim with the content, so the server never mints a parallel history
   * from the HTML — the root cause of duplicated notes.
   */
  readonly yjsState?: string;
  /** Deprecated pre-rollout flag; honoured so old bundles keep autosaving. */
  readonly skipYjsState?: boolean;
  readonly bucket?: ParaBucket | null;
  readonly tags?: string[];
  readonly supertag?: Supertag | null;
  readonly supertagFields?: Record<string, unknown>;
}

interface PersistUpdateResult {
  readonly entity: NoteEntity;
  readonly yjsState?: Buffer;
}

const CONTENT_FIELDS = ['title', 'content'] as const;
const SHARING_FIELDS = [
  'generalAccess',
  'generalAccessPermission',
  'editorsCanShare',
] as const;
const ORGANIZATION_COLUMNS = ['bucket'] as const;
const ORGANIZATION_FIELDS = [
  ...ORGANIZATION_COLUMNS,
  'tags',
  'supertag',
  'supertagFields',
] as const;

@Injectable()
export class UpdateNoteHandler {
  private readonly logger = new Logger(UpdateNoteHandler.name);

  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(TAG_REPOSITORY) private readonly tagRepository: TagRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly verifiedIdentity: VerifiedIdentityPolicy
  ) {}

  async execute(
    input: UpdateNoteInput
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }

    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (
      input.content !== undefined &&
      !input.force &&
      isTrivialHtml(input.content) &&
      !isTrivialHtml(note.content)
    ) {
      this.logger.warn(
        `Refused overwrite of non-trivial content with trivial HTML for note ${input.noteId}`
      );
      return err(NoteErrors.contentOverwriteRefused());
    }

    const validationError = this.validateFields(input);
    if (validationError) {
      return validationError;
    }

    let clientYjsState: Buffer | undefined;
    if (input.yjsState !== undefined) {
      if (input.content === undefined) {
        return err(
          NoteErrors.invalidContent(
            'yjsState requires content in the same update'
          )
        );
      }
      const decoded = decodeYjsStateUpdate(input.yjsState);
      if (decoded.isErr()) {
        return err(decoded.error);
      }
      clientYjsState = decoded.value;
    }

    const isOwner = note.ownerId === input.userId;

    // Only an owner widening the link is gated — opening it, or letting an open
    // one write. Narrowing stays free: an unverified user must be able to
    // revoke a link they already exposed. A non-owner is refused below for
    // lacking the right at all, which is the truer answer than telling them to
    // verify.
    if (
      isOwner &&
      widensLinkExposure(note, linkExposureAfter(note, input)) &&
      !(await this.verifiedIdentity.isVerified(input.userId))
    ) {
      return err(NoteErrors.verificationRequired());
    }

    const persisted = isOwner
      ? await this.executeOwnerUpdate(input, note, clientYjsState)
      : await this.executeEditorUpdate(
          input,
          note,
          userIdResult.value,
          clientYjsState
        );

    if (persisted.isErr()) {
      return err(persisted.error);
    }

    if (isOwner && input.tags !== undefined) {
      const tagged = await this.replaceTags(
        note.id,
        userIdResult.value,
        input.tags
      );
      if (tagged.isErr()) {
        return err(tagged.error);
      }
    }

    this.emitUpdateEvent(input, note.id, persisted.value.yjsState);

    return ok(persisted.value.entity);
  }

  private async executeOwnerUpdate(
    input: UpdateNoteInput,
    note: NoteEntity,
    clientYjsState: Buffer | undefined
  ): Promise<Result<PersistUpdateResult, NoteDomainError>> {
    const updateData: UpdateNoteData = {
      ...pickDefined(input, [
        ...CONTENT_FIELDS,
        ...SHARING_FIELDS,
        ...ORGANIZATION_COLUMNS,
      ]),
      ...this.resolveShareToken(input, note),
      ...this.resolveSupertag(input),
    };

    return this.persistUpdate(
      input.noteId,
      updateData,
      input.content,
      clientYjsState,
      note.yjsState,
      input.skipYjsState
    );
  }

  private async executeEditorUpdate(
    input: UpdateNoteInput,
    note: NoteEntity,
    userId: UserId,
    clientYjsState: Buffer | undefined
  ): Promise<Result<PersistUpdateResult, NoteDomainError>> {
    const canEdit = await this.noteRepository.hasAccess(
      input.noteId,
      userId,
      'editor'
    );
    if (!canEdit) {
      return err(NoteErrors.editPermissionDenied());
    }

    const hasOrganizationFields = ORGANIZATION_FIELDS.some(
      (field) => input[field] !== undefined
    );
    if (hasOrganizationFields) {
      return err(NoteErrors.ownerOnly('set organization fields'));
    }

    const hasSharingFields = SHARING_FIELDS.some(
      (field) => input[field] !== undefined
    );
    if (hasSharingFields) {
      return err(NoteErrors.ownerOnly('change sharing settings'));
    }

    return this.persistUpdate(
      input.noteId,
      pickDefined(input, [...CONTENT_FIELDS]),
      input.content,
      clientYjsState,
      note.yjsState,
      input.skipYjsState
    );
  }

  private async persistUpdate(
    noteId: string,
    updateData: UpdateNoteData,
    content: string | undefined,
    clientYjsState: Buffer | undefined,
    existingYjsState: Buffer | null,
    legacySkipYjsState?: boolean
  ): Promise<Result<PersistUpdateResult, NoteDomainError>> {
    if (content === undefined) {
      const result = await this.noteRepository.update(noteId, updateData);
      return result.map((entity) => ({ entity }));
    }

    const stateResult = clientYjsState
      ? ok(clientYjsState)
      : this.generateYjsState(noteId, content, existingYjsState);
    if (stateResult.isErr()) {
      return err(stateResult.error);
    }
    const yjsState = stateResult.value;

    const result = await this.noteRepository.updateContentWithYjsState(
      noteId,
      { ...updateData, content },
      yjsState
    );

    // A write that came from the editor is not an external mutation:
    // broadcasting it back would clear and refill the sender's own document.
    const fromEditor = clientYjsState !== undefined || legacySkipYjsState;
    return result.map((entity) =>
      fromEditor ? { entity } : { entity, yjsState }
    );
  }

  /**
   * Server-side content writes (copilot, MCP, REST) evolve the note's
   * existing CRDT history when it has one. Minting a fresh doc instead
   * would leave any client holding the old history to merge two parallel
   * copies of the same text.
   */
  private generateYjsState(
    noteId: string,
    content: string,
    existingYjsState: Buffer | null
  ): Result<Buffer, NoteDomainError> {
    try {
      return ok(
        existingYjsState && existingYjsState.byteLength > 0
          ? evolveYjsState(existingYjsState, content)
          : htmlToYjsState(content)
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown parser error';
      this.logger.warn(
        `Failed to generate yjsState for note ${noteId}: ${message}`
      );
      return err(
        NoteErrors.invalidContent(
          `Cannot convert HTML to Yjs state: ${message}`
        )
      );
    }
  }

  private validateFields(
    input: UpdateNoteInput
  ): Result<never, NoteDomainError> | null {
    if (input.title !== undefined) {
      const titleRes = NoteTitle.create(input.title);
      if (titleRes.isErr()) {
        return err(titleRes.error);
      }
    }

    if (input.content !== undefined) {
      const contentRes = NoteContent.create(input.content);
      if (contentRes.isErr()) {
        return err(contentRes.error);
      }
    }

    if (input.supertagFields !== undefined && !input.supertag) {
      return err(
        NoteErrors.invalidSupertag(
          'supertagFields requires a supertag in the same update'
        )
      );
    }

    if (input.supertag !== undefined && input.supertag !== null) {
      const assignment = SupertagAssignment.create(
        input.supertag,
        input.supertagFields
      );
      if (assignment.isErr()) {
        return err(assignment.error);
      }
    }

    // Tags are validated here rather than at write time so a bad path rejects
    // the whole PATCH instead of landing a half-applied update.
    if (input.tags !== undefined) {
      for (const raw of input.tags) {
        const pathRes = TagPath.create(raw);
        if (pathRes.isErr()) {
          return err(pathRes.error);
        }
      }
    }

    return null;
  }

  private async replaceTags(
    noteId: string,
    userId: UserId,
    rawPaths: string[]
  ): Promise<Result<void, NoteDomainError>> {
    const paths: TagPath[] = [];
    for (const raw of rawPaths) {
      const pathRes = TagPath.create(raw);
      if (pathRes.isErr()) {
        return err(pathRes.error);
      }
      paths.push(pathRes.value);
    }

    const tagIds = await this.tagRepository.ensurePaths(userId, paths);
    await this.tagRepository.replaceNoteTags(noteId, tagIds);
    return ok(undefined);
  }

  /**
   * A note's share token is minted once and never rotated: going restricted
   * only flips `generalAccess`, which every share-token reader gates on, so the
   * link resumes working — same URL — when sharing is re-enabled.
   */
  private resolveShareToken(
    input: UpdateNoteInput,
    note: NoteEntity
  ): { shareToken?: string } {
    return input.generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK &&
      !note.shareToken
      ? { shareToken: randomBytes(16).toString('hex') }
      : {};
  }

  /**
   * Clearing the type clears its fields in the same write; assigning one always
   * writes the normalized blob so a stale field from the previous type cannot
   * survive the change.
   */
  private resolveSupertag(input: UpdateNoteInput): {
    supertag?: Supertag | null;
    supertagFields?: SupertagFields | null;
  } {
    if (input.supertag === undefined) {
      return {};
    }
    if (input.supertag === null) {
      return SupertagAssignment.clear().toPrimitive();
    }
    const assignment = SupertagAssignment.create(
      input.supertag,
      input.supertagFields
    );
    // validateFields already rejected an invalid assignment, so this holds.
    return assignment.isOk() ? assignment.value.toPrimitive() : {};
  }

  private emitUpdateEvent(
    input: UpdateNoteInput,
    noteId: string,
    yjsState: Buffer | undefined
  ): void {
    // ORGANIZATION_FIELDS stay out of this pick on purpose. Hocuspocus
    // authorizes per connection, not per field, so anything reaching the
    // document stream is writable by every editor — which would make the
    // owner-only 403 on these fields meaningless. Collaborators pick them
    // up on their next refetch instead.
    const updates = pickDefined(input, [
      ...CONTENT_FIELDS,
      ...SHARING_FIELDS,
    ]) as NoteUpdatedEventUpdates;

    if (Object.keys(updates).length > 0) {
      this.eventEmitter.emit(
        NoteUpdatedEvent.EVENT_NAME,
        new NoteUpdatedEvent(noteId, updates, input.userId, yjsState)
      );
    }
  }
}
