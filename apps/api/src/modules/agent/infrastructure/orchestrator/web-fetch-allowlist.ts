import { extractHttpUrls } from '@knowtis/ai-gateway';

export class WebFetchAllowlist {
  private readonly urls = new Set<string>();

  seedFromText(text: string): void {
    for (const url of extractHttpUrls(text)) {
      this.add(url);
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
