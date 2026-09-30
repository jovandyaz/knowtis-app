import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
} from '@nestjs/common';

/** Below Railway's 10 s draining window, so dispose and the shutdown hooks still run before SIGKILL. */
export const SHUTDOWN_DRAIN_TIMEOUT_MS = 8_000;

/** The reason every signal the drain aborts carries: never a user cancel. */
export const SHUTDOWN_ABORT_REASON = 'shutdown';

/** In-flight work the drain aborts at shutdown and then waits for. */
export interface DrainSource {
  abortAll(reason: unknown): void;
  /** Resolves true once nothing is in flight, or false when `timeoutMs` passes first. */
  whenIdle(timeoutMs: number): Promise<boolean>;
}

/**
 * The one shutdown drain for socket work. Nest runs `beforeApplicationShutdown`
 * module by module, so a drain per gateway would add their deadlines up; this one
 * aborts every registered source at once and waits for all of them under a single
 * deadline, before `dispose()` closes the socket servers and the shutdown hooks
 * close Postgres and Redis.
 */
@Injectable()
export class ShutdownDrain implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ShutdownDrain.name);
  private readonly sources = new Set<DrainSource>();
  private draining = false;

  /** True from the moment the shutdown starts; new work must be refused from then on. */
  get isDraining(): boolean {
    return this.draining;
  }

  register(source: DrainSource): void {
    this.sources.add(source);
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.draining = true;
    const startedAt = Date.now();
    const sources = [...this.sources];
    for (const source of sources) {
      source.abortAll(SHUTDOWN_ABORT_REASON);
    }
    const idle = await Promise.all(
      sources.map((source) => source.whenIdle(SHUTDOWN_DRAIN_TIMEOUT_MS))
    );
    const drained = idle.every(Boolean);
    const entry = {
      event: 'shutdown.drained',
      drained,
      durationMs: Date.now() - startedAt,
    };
    if (drained) {
      this.logger.log(entry);
    } else {
      this.logger.warn(entry);
    }
  }
}
