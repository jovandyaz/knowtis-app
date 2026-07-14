import { extractHttpUrls } from '@knowtis/ai-gateway';

export class WebFetchAllowlist {
  private readonly urls = new Set<string>();

  seedFromText(text: string): void {
    for (const url of extractHttpUrls(text)) {
      this.add(url);
    }
  }

  // User turns are victim-authored; injected URLs arrive via assistant/tool content.
  seedFromMessages(
    messages: readonly { role: string; content: string }[]
  ): void {
    for (const message of messages) {
      if (message.role === 'user') {
        this.seedFromText(message.content);
      }
    }
  }

  add(url: string): void {
    try {
      this.urls.add(new URL(url).href);
    } catch {
      // ignore malformed urls
    }
  }

  has(url: string): boolean {
    try {
      return this.urls.has(new URL(url).href);
    } catch {
      return false;
    }
  }
}
