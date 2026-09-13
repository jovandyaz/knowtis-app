import { describe, expect, it } from 'vitest';

import { createBaseExtensions } from '../extensions/base-extensions';
import { ImageNode } from '../extensions/image/ImageNode';
import { diffNoteHtml } from './diff-note-html';

const BASE = createBaseExtensions();
const WITH_IMAGE = [...createBaseExtensions(), ImageNode];

describe('diffNoteHtml', () => {
  it('reports no changes for identical documents', () => {
    const html = '<h1>Stack</h1><ul><li><p>Astro + Vite</p></li></ul>';
    const diff = diffNoteHtml(html, html, BASE);
    expect(diff.count).toBe(0);
    expect(diff.changes).toEqual([]);
  });

  it('reports a pure insertion for words added inside a list item', () => {
    const before = '<ul><li><p>Astro + Vite como base</p></li></ul>';
    const after =
      '<ul><li><p>Astro + Vite como base del sitio estático</p></li></ul>';
    const diff = diffNoteHtml(before, after, BASE);
    expect(diff.count).toBe(1);
    const [change] = diff.changes;
    expect(change.fromA).toBe(change.toA);
    expect(diff.after.textBetween(change.fromB, change.toB)).toContain(
      'del sitio estático'
    );
  });

  it('reports a pure deletion when a paragraph is removed', () => {
    const before = '<p>Cloudflare Pages.</p><p>Alternativa: Vercel.</p>';
    const after = '<p>Cloudflare Pages.</p>';
    const diff = diffNoteHtml(before, after, BASE);
    expect(diff.count).toBe(1);
    const [change] = diff.changes;
    expect(change.fromB).toBe(change.toB);
    expect(diff.before.textBetween(change.fromA, change.toA, ' ')).toContain(
      'Alternativa: Vercel.'
    );
  });

  it('reports a replacement when heading text changes', () => {
    const diff = diffNoteHtml(
      '<h1>Stack para landing</h1>',
      '<h1>Landing de agencia</h1>',
      BASE
    );
    expect(diff.count).toBe(1);
    const [change] = diff.changes;
    expect(change.toA).toBeGreaterThan(change.fromA);
    expect(change.toB).toBeGreaterThan(change.fromB);
  });

  it('returns changes in document order', () => {
    const before = '<p>uno</p><p>dos</p><p>tres</p>';
    const after = '<p>uno más</p><p>dos</p><p>tres y cuatro</p>';
    const diff = diffNoteHtml(before, after, BASE);
    expect(diff.count).toBe(2);
    expect(diff.changes[0].fromB).toBeLessThan(diff.changes[1].fromB);
  });

  it('surfaces a dropped image only when the schema knows images', () => {
    const before =
      '<p>Intro</p><figure data-image><img src="https://cdn.test/a.png" alt="a"></figure>';
    const after = '<p>Intro</p>';
    expect(diffNoteHtml(before, after, BASE).count).toBe(0);
    const rich = diffNoteHtml(before, after, WITH_IMAGE);
    expect(rich.count).toBe(1);
    const [change] = rich.changes;
    expect(
      rich.before.slice(change.fromA, change.toA).content.firstChild?.type.name
    ).toBe('image');
  });
});
