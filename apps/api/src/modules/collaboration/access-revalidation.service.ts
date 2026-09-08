import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import {
  COLLABORATION_CLOSE_REASON,
  HANDSHAKE_FAILURE,
} from '@knowtis/shared-types';

import {
  resolveEffectiveAccess,
  type AccessSnapshot,
  type EffectiveAccess,
  type SessionIdentity,
} from '../notes/domain/access-policy';
import {
  ACCESS_SNAPSHOT_REPOSITORY,
  type AccessSnapshotRepository,
} from '../notes/domain/ports/access-snapshot.repository';
import { HandshakeError } from './handshake-error';

const RENEW_MS = 1000;
const READ_DEADLINE_MS = 1000;
const LEASE_MS = 2000;
const MAX_READS = 2;
const MAX_QUEUED_NOTES = 64;
const FAILURE_LOG_INTERVAL_MS = 30000;

interface SessionConnection {
  close(event: { code: number; reason: string }): void;
  onClose(callback: () => void): unknown;
}
export interface AccessLease {
  readonly noteId: string;
  readonly identity: SessionIdentity;
  readonly administrative: boolean;
  effectiveAccess: EffectiveAccess;
  ownerId: string;
  generalAccess: AccessSnapshot['generalAccess'];
  expiresAt: number;
  closed: boolean;
  closeReason: string;
  connection?: SessionConnection;
}
interface PendingLease {
  resolve(lease: AccessLease): void;
  reject(error: Error): void;
}
interface NoteState {
  readonly noteId: string;
  readonly sessions: Set<AccessLease>;
  generation: number;
  reading: boolean;
  dirty: boolean;
  nextReadAt: number;
  queuedAt?: number;
}

@Injectable()
export class AccessRevalidationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AccessRevalidationService.name);
  private readonly notes = new Map<string, NoteState>();
  private readonly pending = new Map<AccessLease, PendingLease>();
  private readonly queue = new Set<NoteState>();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private activeReads = 0;
  private peakReads = 0;
  private peakQueue = 0;
  private coalescedEvents = 0;
  private expiredSessions = 0;
  private completedReads = 0;
  private totalReadMs = 0;
  private failedReads = 0;
  private timedOutReads = 0;
  private lastFailureLogAt = Number.NEGATIVE_INFINITY;

  constructor(
    @Inject(ACCESS_SNAPSHOT_REPOSITORY)
    private readonly repository: AccessSnapshotRepository
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.sweep(), 50);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearInterval(this.timer);
    for (const state of this.notes.values()) {
      this.closeNote(state, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE);
    }
    this.queue.clear();
  }

  get diagnostics() {
    return {
      activeReads: this.activeReads,
      peakReads: this.peakReads,
      queuedNotes: this.queue.size,
      peakQueuedNotes: this.peakQueue,
      coalescedEvents: this.coalescedEvents,
      expiredSessions: this.expiredSessions,
      completedReads: this.completedReads,
      totalReadMs: this.totalReadMs,
      failedReads: this.failedReads,
      timedOutReads: this.timedOutReads,
      activeNotes: this.notes.size,
    };
  }

  acquire(
    noteId: string,
    identity: SessionIdentity,
    administrative = false
  ): Promise<AccessLease> {
    if (this.stopped) {
      return Promise.reject(
        new HandshakeError(HANDSHAKE_FAILURE.INTERNAL_ERROR)
      );
    }
    let state = this.notes.get(noteId);
    if (!state) {
      state = {
        noteId,
        sessions: new Set(),
        generation: 0,
        reading: false,
        dirty: false,
        nextReadAt: 0,
      };
      this.notes.set(noteId, state);
    }
    const lease: AccessLease = {
      noteId,
      identity,
      administrative,
      effectiveAccess: 'none',
      ownerId: '',
      generalAccess: 'restricted',
      expiresAt: performance.now() + READ_DEADLINE_MS,
      closed: false,
      closeReason: COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE,
    };
    state.sessions.add(lease);
    const result = new Promise<AccessLease>((resolve, reject) =>
      this.pending.set(lease, { resolve, reject })
    );
    this.requestRead(state);
    return result;
  }

  register(lease: AccessLease, connection: SessionConnection): void {
    lease.connection = connection;
    connection.onClose(() => this.close(lease, lease.closeReason));
    if (lease.closed || performance.now() >= lease.expiresAt) {
      this.close(lease, lease.closeReason);
      connection.close({ code: 4403, reason: lease.closeReason });
    }
  }

  assertValid(lease: AccessLease | undefined): void {
    if (!lease || lease.closed || performance.now() >= lease.expiresAt) {
      if (lease) {
        this.close(lease, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE);
      }
      throw new HandshakeError(HANDSHAKE_FAILURE.INTERNAL_ERROR);
    }
  }

  async invalidate(noteId: string): Promise<void> {
    const state = this.notes.get(noteId);
    if (!state || this.stopped) {
      return;
    }
    state.generation++;
    if (state.reading || this.queue.has(state)) {
      this.coalescedEvents++;
    }
    state.dirty = true;
    this.requestRead(state);
  }

  async invalidateAll(): Promise<void> {
    for (const noteId of this.notes.keys()) {
      void this.invalidate(noteId);
    }
  }

  private sweep(): void {
    if (this.stopped) {
      return;
    }
    const now = performance.now();
    for (const state of this.notes.values()) {
      for (const lease of state.sessions) {
        if (now >= lease.expiresAt) {
          this.expiredSessions++;
          this.close(lease, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE);
        }
      }
      if (state.sessions.size && now >= state.nextReadAt) {
        this.requestRead(state);
      }
      this.cleanup(state);
    }
    this.drain();
  }

  private requestRead(state: NoteState): void {
    if (
      this.stopped ||
      state.reading ||
      this.queue.has(state) ||
      !state.sessions.size
    ) {
      return;
    }
    if (this.activeReads < MAX_READS) {
      this.startRead(state);
      return;
    }
    if (this.queue.size >= MAX_QUEUED_NOTES) {
      this.closeNote(state, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE);
      return;
    }
    state.queuedAt = performance.now();
    this.queue.add(state);
    this.peakQueue = Math.max(this.peakQueue, this.queue.size);
  }

  private drain(): void {
    if (this.stopped) {
      return;
    }
    for (const state of this.queue) {
      if (
        !state.sessions.size ||
        performance.now() - (state.queuedAt ?? 0) >= READ_DEADLINE_MS
      ) {
        this.queue.delete(state);
        this.closeNote(state, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE);
        continue;
      }
      if (this.activeReads >= MAX_READS) {
        break;
      }
      this.queue.delete(state);
      this.startRead(state);
    }
  }

  private startRead(state: NoteState): void {
    const startedAt = performance.now();
    const generation = state.generation;
    state.nextReadAt = startedAt + RENEW_MS;
    state.reading = true;
    state.dirty = false;
    this.activeReads++;
    this.peakReads = Math.max(this.peakReads, this.activeReads);
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      this.reportReadFailure('deadline_exceeded');
      this.closeNote(state, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE);
    }, READ_DEADLINE_MS);
    deadline.unref?.();

    // Keep the slot because caller timeout does not cancel queued or running SQL.
    void Promise.resolve()
      .then(() => this.repository.findAccessSnapshot(state.noteId))
      .then((snapshot) => {
        if (
          this.stopped ||
          timedOut ||
          performance.now() - startedAt >= READ_DEADLINE_MS ||
          generation !== state.generation
        ) {
          return;
        }
        this.apply(state, snapshot, startedAt + LEASE_MS);
      })
      .catch(() => {
        this.reportReadFailure('query_failed');
        this.closeNote(state, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE);
      })
      .finally(() => {
        clearTimeout(deadline);
        this.activeReads--;
        this.completedReads++;
        this.totalReadMs += performance.now() - startedAt;
        state.reading = false;
        if (!this.stopped && state.dirty && state.sessions.size) {
          this.requestRead(state);
        }
        this.cleanup(state);
        this.drain();
      });
  }

  private reportReadFailure(
    reason: 'query_failed' | 'deadline_exceeded'
  ): void {
    if (this.stopped) {
      return;
    }
    if (reason === 'query_failed') {
      this.failedReads++;
    } else {
      this.timedOutReads++;
    }
    const now = performance.now();
    if (now - this.lastFailureLogAt < FAILURE_LOG_INTERVAL_MS) {
      return;
    }
    this.lastFailureLogAt = now;
    this.logger.warn({
      operation: 'access_snapshot_read',
      authority: 'postgresql_primary',
      reason,
    });
  }

  private apply(
    state: NoteState,
    snapshot: AccessSnapshot | null,
    expiresAt: number
  ): void {
    for (const lease of state.sessions) {
      if (lease.closed) {
        continue;
      }
      const resolved = resolveEffectiveAccess(snapshot, lease.identity);
      const effective =
        snapshot && lease.administrative && resolved !== 'owner'
          ? 'editor'
          : resolved;
      const pending = this.pending.get(lease);
      if (!snapshot || effective === 'none') {
        pending?.reject(
          new HandshakeError(
            snapshot
              ? HANDSHAKE_FAILURE.FORBIDDEN
              : HANDSHAKE_FAILURE.NOTE_NOT_FOUND
          )
        );
        this.pending.delete(lease);
        this.close(lease, COLLABORATION_CLOSE_REASON.ACCESS_CHANGED);
      } else if (!pending && effective !== lease.effectiveAccess) {
        this.close(lease, COLLABORATION_CLOSE_REASON.ACCESS_CHANGED);
      } else if (performance.now() >= lease.expiresAt) {
        this.close(lease, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE);
      } else if (!pending && !lease.connection) {
        continue;
      } else {
        lease.effectiveAccess = effective;
        lease.ownerId = snapshot.ownerId;
        lease.generalAccess = snapshot.generalAccess;
        lease.expiresAt = expiresAt;
        this.pending.delete(lease);
        pending?.resolve(lease);
      }
    }
  }

  private close(lease: AccessLease, reason: string): void {
    if (lease.closed) {
      return;
    }
    lease.closed = true;
    lease.closeReason = reason;
    this.pending
      .get(lease)
      ?.reject(new HandshakeError(HANDSHAKE_FAILURE.INTERNAL_ERROR));
    this.pending.delete(lease);
    const state = this.notes.get(lease.noteId);
    state?.sessions.delete(lease);
    lease.connection?.close({ code: 4403, reason });
    if (state) {
      this.cleanup(state);
    }
  }

  private closeNote(state: NoteState, reason: string): void {
    for (const lease of state.sessions) {
      this.close(lease, reason);
    }
    this.cleanup(state);
  }

  private cleanup(state: NoteState): void {
    if (state.sessions.size) {
      return;
    }
    this.queue.delete(state);
    if (!state.reading) {
      this.notes.delete(state.noteId);
    }
  }
}
