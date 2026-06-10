import { describe, expect, it } from 'vitest';

import { htmlToPlainText, markdownToSafeHtml } from './html-sanitizer';

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

  it('neutralizes javascript: link hrefs but keeps visible text', () => {
    const html = markdownToSafeHtml('[click](javascript:alert(1))');
    expect(html).toContain('click');
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it('preserves the literal word "javascript:" in prose', () => {
    expect(markdownToSafeHtml('Use the javascript: scheme')).toContain(
      'javascript:'
    );
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(markdownToSafeHtml('   ')).toBe('');
  });
});

describe('htmlToPlainText', () => {
  it('strips tags keeping the text content', () => {
    expect(htmlToPlainText('<p>do <strong>it</strong> now</p>')).toBe(
      'do it now'
    );
  });

  it('separates block elements with line breaks', () => {
    expect(htmlToPlainText('<p>first</p><p>second</p>')).toBe('first\nsecond');
    expect(htmlToPlainText('<ul><li>one</li><li>two</li></ul>')).toBe(
      'one\ntwo'
    );
  });

  it('treats <br> as a line break', () => {
    expect(htmlToPlainText('<p>line one<br>line two</p>')).toBe(
      'line one\nline two'
    );
  });

  it('decodes common html entities', () => {
    expect(
      htmlToPlainText('<p>Tom &amp; Jerry &lt;3 &quot;cats&quot;</p>')
    ).toBe('Tom & Jerry <3 "cats"');
  });

  it('drops script content entirely', () => {
    expect(htmlToPlainText('<p>safe</p><script>alert(1)</script>')).toBe(
      'safe'
    );
  });

  it('returns empty string for empty or whitespace input', () => {
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText('  \n ')).toBe('');
  });
});
