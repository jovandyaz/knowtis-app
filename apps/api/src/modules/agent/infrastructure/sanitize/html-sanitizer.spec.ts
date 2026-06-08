import { describe, expect, it } from 'vitest';

import { markdownToSafeHtml } from './html-sanitizer';

describe('markdownToSafeHtml', () => {
  it('renders basic markdown to html', () => {
    const html = markdownToSafeHtml('# Title\n\nHello **world**');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>world</strong>');
  });

  it('strips raw script tags', () => {
    const html = markdownToSafeHtml('Hi <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)</script>');
  });

  it('drops javascript: links', () => {
    const html = markdownToSafeHtml('[x](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(markdownToSafeHtml('   ')).toBe('');
  });
});
