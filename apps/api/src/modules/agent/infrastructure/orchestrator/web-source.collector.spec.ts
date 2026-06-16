import { describe, expect, it } from 'vitest';

import { WebSourceCollector } from './web-source.collector';

describe('WebSourceCollector', () => {
  it('should dedup sources by url, keeping first-seen title', () => {
    const c = new WebSourceCollector();
    c.add({ title: 'First', url: 'https://a.com' });
    c.add({ title: 'Dup', url: 'https://a.com' });
    c.add({ title: 'Second', url: 'https://b.com' });
    expect(c.all).toEqual([
      { title: 'First', url: 'https://a.com' },
      { title: 'Second', url: 'https://b.com' },
    ]);
  });

  it('should return an empty array when nothing was added', () => {
    expect(new WebSourceCollector().all).toEqual([]);
  });
});
