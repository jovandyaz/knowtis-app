import type { WebSource } from '../../domain/agent-event';

export class WebSourceCollector {
  private readonly sources = new Map<string, WebSource>();

  add(source: WebSource): void {
    if (!this.sources.has(source.url)) {
      this.sources.set(source.url, source);
    }
  }

  get all(): readonly WebSource[] {
    return [...this.sources.values()];
  }
}
