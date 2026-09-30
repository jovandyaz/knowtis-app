import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
} from '@nestjs/common';

/**
 * With the 1 s PostHog and Langfuse flushes after it, leaves about 1 s of Railway's
 * 10 s draining window for dispose and the pools to close before SIGKILL.
 */
export const SHUTDOWN_DRAIN_TIMEOUT_MS = 7_000;

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
  private readonly tracked = new Set<Promise<void>>();
  private draining = false;

  /** True from the moment the shutdown starts; new work must be refused from then on. */
  get isDraining(): boolean {
    return this.draining;
  }

  register(source: DrainSource): void {
    this.sources.add(source);
  }

  /** Runs work the drain waits for but never aborts, such as a commit that must land once started. */
  track<T>(work: () => Promise<T>): Promise<T> {
    let running: Promise<T>;
    try {
      running = work();
    } catch (error) {
      running = Promise.reject(error);
    }
    const settled = running.then(
      () => undefined,
      () => undefined
    );
    this.tracked.add(settled);
    void settled.then(() => this.tracked.delete(settled));
    return running;
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.draining = true;
    const startedAt = Date.now();
    const sources = [...this.sources];
    for (const source of sources) {
      source.abortAll(SHUTDOWN_ABORT_REASON);
    }
    const idle = await Promise.all([
      ...sources.map((source) => source.whenIdle(SHUTDOWN_DRAIN_TIMEOUT_MS)),
      this.whenTrackedSettled(SHUTDOWN_DRAIN_TIMEOUT_MS),
    ]);
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

  private async whenTrackedSettled(timeoutMs: number): Promise<boolean> {
    if (this.tracked.size === 0) {
      return true;
    }
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      return await Promise.race([
        Promise.all(this.tracked).then(() => true),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
