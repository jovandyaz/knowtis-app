import { describe, expect, it } from 'vitest';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { hardenAssistantUrl } from './harden-assistant-url';

const imgNode = { tagName: 'img' } as never;
const linkNode = { tagName: 'a' } as never;

describe('hardenAssistantUrl', () => {
  it('drops a remote http(s) image source', () => {
    expect(
      hardenAssistantUrl('https://evil.com/x?d=secret', 'src', imgNode)
    ).toBe('');
    expect(hardenAssistantUrl('http://evil.com/p.gif', 'src', imgNode)).toBe(
      ''
    );
  });

  it('drops a protocol-relative image source', () => {
    expect(hardenAssistantUrl('//evil.com/x.png', 'src', imgNode)).toBe('');
  });

  it('drops non-canonical remote image sources the browser still resolves', () => {
    expect(hardenAssistantUrl('https:/evil.com', 'src', imgNode)).toBe('');
    expect(hardenAssistantUrl('https:evil.com', 'src', imgNode)).toBe('');
    expect(hardenAssistantUrl('https:\\evil.com', 'src', imgNode)).toBe('');
  });

  it('keeps an image from the app blob store', () => {
    const stored = `https://${STORED_IMAGE_HOST}/notes/n1/lake.webp`;
    expect(hardenAssistantUrl(stored, 'src', imgNode)).toBe(stored);
  });

  it('drops an image from another blob store', () => {
    expect(
      hardenAssistantUrl(
        'https://attacker123.public.blob.vercel-storage.com/x.png',
        'src',
        imgNode
      )
    ).toBe('');
  });

  it('drops a relative image source (resolves to the app origin proxies)', () => {
    expect(hardenAssistantUrl('/t/x', 'src', imgNode)).toBe('');
    expect(hardenAssistantUrl('/img/local.png', 'src', imgNode)).toBe('');
  });

  it('drops an inline data image', () => {
    expect(
      hardenAssistantUrl('data:image/png;base64,iVBORw0KGgo=', 'src', imgNode)
    ).toBe('');
  });

  it('keeps a normal link href', () => {
    expect(
      hardenAssistantUrl('https://example.com/article', 'href', linkNode)
    ).toBe('https://example.com/article');
  });

  it('drops a javascript: link (delegates to default sanitizer)', () => {
    expect(hardenAssistantUrl('javascript:alert(1)', 'href', linkNode)).toBe(
      ''
    );
  });

  it('drops a vbscript: link', () => {
    expect(hardenAssistantUrl('vbscript:msgbox', 'href', linkNode)).toBe('');
  });

  it('drops a data: link href', () => {
    expect(hardenAssistantUrl('data:text/html,x', 'href', linkNode)).toBe('');
  });

  it('keeps a mailto: link href', () => {
    expect(hardenAssistantUrl('mailto:a@b.com', 'href', linkNode)).toBe(
      'mailto:a@b.com'
    );
  });

  it('keeps a tel: link href', () => {
    expect(hardenAssistantUrl('tel:+123', 'href', linkNode)).toBe('tel:+123');
  });

  it('drops a blob: image source', () => {
    expect(hardenAssistantUrl('blob:https://x/abc', 'src', imgNode)).toBe('');
  });

  it('keeps a relative link href', () => {
    expect(hardenAssistantUrl('/notes/n1', 'href', linkNode)).toBe('/notes/n1');
  });
});
