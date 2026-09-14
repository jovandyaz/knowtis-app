import { describe, expect, it } from 'vitest';

import { createBaseExtensions } from '../extensions/base-extensions';
import { ImageNode } from '../extensions/image/ImageNode';
import { diffNoteHtml, type DocDiff } from './diff-note-html';

const BASE = createBaseExtensions();
const WITH_IMAGE = [...createBaseExtensions(), ImageNode];

const NOTE_HTML = [
  '<h1>Landing de agencia</h1>',
  '<h2>Stack</h2>',
  '<ul><li><p>Astro + Vite como base</p></li>',
  '<li><p>React + TypeScript para componentes interactivos</p></li></ul>',
  '<h2>Deploy</h2>',
  '<p>Cloudflare Pages: recomendado por su rendimiento global.</p>',
  '<p>Alternativa: Vercel si se prioriza el despliegue simple.</p>',
].join('');

const PROPOSED_HTML = [
  '<h1>Landing de agencia</h1>',
  '<p>Objetivo: convertir visitantes en prospectos.</p>',
  '<h2>Stack</h2>',
  '<ul><li><p>Astro + Vite como base del sitio estatico</p></li>',
  '<li><p>React + TypeScript para componentes interactivos</p></li></ul>',
  '<h2>Deploy</h2>',
  '<p>Cloudflare Pages: recomendado por su rendimiento global.</p>',
].join('');

const SURVIVING_PARAGRAPH =
  'Cloudflare Pages: recomendado por su rendimiento global.';

function textA(diff: DocDiff, index: number): string {
  const { fromA, toA } = diff.changes[index];
  return diff.before.textBetween(fromA, toA, ' ').trim();
}

function textB(diff: DocDiff, index: number): string {
  const { fromB, toB } = diff.changes[index];
  return diff.after.textBetween(fromB, toB, ' ').trim();
}

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

  it('reports no changes when both sides are empty', () => {
    const diff = diffNoteHtml('', '', BASE);
    expect(diff.count).toBe(0);
    expect(diff.changes).toEqual([]);
  });

  it('diffs a brand-new empty note against its first proposal', () => {
    const diff = diffNoteHtml('', '<p>Primer borrador</p>', BASE);
    expect(diff.count).toBe(1);
    const [change] = diff.changes;
    expect(diff.after.textBetween(change.fromB, change.toB, ' ')).toContain(
      'Primer borrador'
    );
  });

  it('diffs a cleared note as a deletion', () => {
    const diff = diffNoteHtml('<p>Todo fuera</p>', '', BASE);
    expect(diff.count).toBe(1);
    const [change] = diff.changes;
    expect(diff.before.textBetween(change.fromA, change.toA, ' ')).toContain(
      'Todo fuera'
    );
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

  it('keeps a removed paragraph in its own block-aligned deletion', () => {
    const diff = diffNoteHtml(NOTE_HTML, PROPOSED_HTML, BASE);
    expect(diff.count).toBe(3);

    const [inserted, edited, removed] = diff.changes;

    expect(inserted.fromA).toBe(inserted.toA);
    expect(textB(diff, 0)).toBe(
      'Objetivo: convertir visitantes en prospectos.'
    );
    expect(diff.after.resolve(inserted.fromB).parent.type.name).toBe('doc');

    expect(edited.fromA).toBe(edited.toA);
    expect(diff.after.textBetween(edited.fromB, edited.toB)).toBe(
      ' del sitio estatico'
    );

    expect(removed.fromB).toBe(removed.toB);
    expect(textA(diff, 2)).toBe(
      'Alternativa: Vercel si se prioriza el despliegue simple.'
    );
    expect(diff.before.resolve(removed.fromA).parent.type.name).toBe('doc');
    expect(diff.after.resolve(removed.fromB).parent.type.name).toBe('doc');
  });

  it('leaves the paragraph next to a removed block untouched', () => {
    const diff = diffNoteHtml(NOTE_HTML, PROPOSED_HTML, BASE);
    diff.changes.forEach((_, index) => {
      expect(textA(diff, index)).not.toContain('Cloudflare');
      expect(textB(diff, index)).not.toContain('Cloudflare');
    });
    expect(diff.after.textContent).toContain(SURVIVING_PARAGRAPH);

    const removed = diff.changes[2];
    expect(diff.before.resolve(removed.fromA).depth).toBe(0);
    expect(diff.before.resolve(removed.fromA).parent.type.name).toBe('doc');
    expect(diff.before.textBetween(removed.fromA, removed.toA)).toBe(
      'Alternativa: Vercel si se prioriza el despliegue simple.'
    );
  });

  it('reports a merged paragraph break as a boundary-only deletion', () => {
    const diff = diffNoteHtml(
      '<ul><li><p>alfa</p></li><li><p>beta</p></li></ul>',
      '<ul><li><p>alfa beta</p></li></ul>',
      BASE
    );
    expect(diff.count).toBe(1);
    const [change] = diff.changes;
    const slice = diff.before.slice(change.fromA, change.toA);
    expect(slice.content.childCount).toBe(2);
    expect(slice.openStart).toBeGreaterThan(0);
    expect(slice.openEnd).toBeGreaterThan(0);
    expect(diff.before.textBetween(change.fromA, change.toA)).toBe('');
  });

  it('pairs two rewritten adjacent paragraphs one to one', () => {
    const diff = diffNoteHtml(
      '<p>uno</p><p>dos</p>',
      '<p>uno grande</p><p>dos chico</p>',
      BASE
    );
    expect(diff.count).toBe(2);
    diff.changes.forEach((change) => {
      expect(diff.after.resolve(change.fromB).parent.type.name).toBe(
        'paragraph'
      );
      expect(diff.before.resolve(change.fromA).parent.type.name).toBe(
        'paragraph'
      );
    });
    expect(textB(diff, 0)).toContain('grande');
    expect(textB(diff, 1)).toContain('chico');
  });

  it('treats every proposed block as an insertion when the note was empty', () => {
    const diff = diffNoteHtml('', '<p>Uno</p><p>Dos</p><p>Tres</p>', BASE);
    expect(diff.count).toBeGreaterThan(0);
    const insertedText = diff.changes
      .map((_, index) => textB(diff, index))
      .join(' ');
    diff.changes.forEach((change) => {
      expect(change.fromA).toBe(change.toA);
    });
    expect(insertedText).toContain('Uno');
    expect(insertedText).toContain('Dos');
    expect(insertedText).toContain('Tres');
  });

  it('shifts later positions past a block removed in the middle', () => {
    const diff = diffNoteHtml(
      '<p>uno</p><p>dos</p><p>tres</p><p>cuatro</p>',
      '<p>uno</p><p>tres</p><p>cuatro y cinco</p>',
      BASE
    );
    expect(diff.count).toBe(2);

    const [removed, edited] = diff.changes;
    expect(removed.fromB).toBe(removed.toB);
    expect(textA(diff, 0)).toBe('dos');

    expect(textB(diff, 1)).toContain('y cinco');
    expect(diff.after.resolve(edited.fromB).parent.textContent).toBe(
      'cuatro y cinco'
    );
  });

  it('reports a block replacement when only the block type changes', () => {
    const diff = diffNoteHtml('<h1>Stack</h1>', '<h2>Stack</h2>', BASE);
    expect(diff.count).toBe(1);
    const [change] = diff.changes;
    expect(textA(diff, 0)).toBe('Stack');
    expect(textB(diff, 0)).toBe('Stack');
    expect(diff.before.resolve(change.fromA).parent.type.name).toBe('doc');
  });
});
