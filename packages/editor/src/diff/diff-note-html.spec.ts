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

  it('reports a mark-only edit as the marked word, not the whole block', () => {
    const diff = diffNoteHtml(
      '<p>Astro como base del sitio</p>',
      '<p>Astro como <strong>base</strong> del sitio</p>',
      BASE
    );
    expect(diff.count).toBe(1);
    expect(textA(diff, 0)).toBe('base');
    expect(textB(diff, 0)).toBe('base');
    expect(diff.before.resolve(diff.changes[0].fromA).parent.type.name).toBe(
      'paragraph'
    );
  });

  it('reports a changed link target as the linked text', () => {
    const diff = diffNoteHtml(
      '<p>ver <a href="https://a.test">docs</a> hoy</p>',
      '<p>ver <a href="https://b.test">docs</a> hoy</p>',
      BASE
    );
    expect(diff.count).toBe(1);
    expect(textA(diff, 0)).toBe('docs');
    expect(textB(diff, 0)).toBe('docs');
  });

  it('reports a heading whose level and text change as one block replacement', () => {
    const diff = diffNoteHtml(
      '<h2>Stack tecnico</h2>',
      '<h3>Stack moderno</h3>',
      BASE
    );
    expect(diff.count).toBe(1);
    expect(textA(diff, 0)).toBe('Stack tecnico');
    expect(textB(diff, 0)).toBe('Stack moderno');
    expect(diff.after.nodeAt(diff.changes[0].fromB)?.attrs['level']).toBe(3);
  });

  it('reports a paragraph turned heading with the same text as one change', () => {
    const diff = diffNoteHtml('<p>Stack</p>', '<h2>Stack</h2>', BASE);
    expect(diff.count).toBe(1);
    expect(textA(diff, 0)).toBe('Stack');
    expect(textB(diff, 0)).toBe('Stack');
  });

  it('widens a checked task to its own item, not the whole list', () => {
    const item = (checked: boolean, text: string) =>
      `<li data-type="taskItem" data-checked="${checked}"><p>${text}</p></li>`;
    const diff = diffNoteHtml(
      `<ul data-type="taskList">${item(false, 'hacer')}${item(false, 'probar')}</ul>`,
      `<ul data-type="taskList">${item(true, 'hacer')}${item(false, 'probar')}</ul>`,
      BASE
    );
    expect(diff.count).toBe(1);
    expect(diff.before.nodeAt(diff.changes[0].fromA)?.type.name).toBe(
      'taskItem'
    );
    expect(textA(diff, 0)).toBe('hacer');
    expect(textB(diff, 0)).toBe('hacer');
  });

  it('reports a line break that loses its mark instead of no changes', () => {
    const diff = diffNoteHtml(
      '<p><strong>a<br></strong>b</p>',
      '<p><strong>a</strong><br>b</p>',
      BASE
    );
    expect(diff.count).toBe(1);
  });

  it('keeps a word-level diff for a block far down a long note', () => {
    const filler = `<p>${'relleno '.repeat(400)}</p>`;
    const diff = diffNoteHtml(
      `${filler}<p>uno dos tres</p>`,
      `${filler}<p>uno cuatro tres</p>`,
      BASE
    );
    expect(diff.changes[0].fromA).toBeGreaterThan(2500);
    expect(diff.count).toBe(1);
    expect(textA(diff, 0)).toBe('dos');
    expect(textB(diff, 0)).toBe('cuatro');
  });

  it('widens a checked parent task over its nested sub-task edits', () => {
    const tasks = (checked: boolean, child: string) =>
      `<ul data-type="taskList"><li data-type="taskItem" data-checked="${checked}"><p>padre</p>` +
      `<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>${child}</p></li></ul></li></ul>`;
    const diff = diffNoteHtml(
      tasks(false, 'hijo viejo'),
      tasks(true, 'hijo nuevo'),
      BASE
    );
    expect(diff.count).toBe(1);
    expect(textA(diff, 0)).toBe('padre hijo viejo');
    expect(textB(diff, 0)).toBe('padre hijo nuevo');
  });

  it('still uses full LCS alignment under the block-count cap', () => {
    const before = ['a', 'b', 'c', 'd', 'e']
      .map((letter) => `<p>${letter}</p>`)
      .join('');
    const after = ['new', 'a', 'b', 'c', 'd', 'e']
      .map((word) => `<p>${word}</p>`)
      .join('');
    const diff = diffNoteHtml(before, after, BASE);
    expect(diff.count).toBe(1);
    const [change] = diff.changes;
    expect(change.fromA).toBe(change.toA);
    expect(textB(diff, 0)).toBe('new');
  });

  it('bounds block alignment above the LCS cap and still produces a valid diff', () => {
    const BLOCK_COUNT = 1200;
    const before = Array.from({ length: BLOCK_COUNT }, () => '<p></p>').join(
      ''
    );
    const after = Array.from({ length: BLOCK_COUNT + 1 }, () => '<p></p>').join(
      ''
    );

    const start = performance.now();
    const diff = diffNoteHtml(before, after, BASE);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(diff.changes.length).toBeGreaterThan(0);

    let previousToA = 0;
    let previousToB = 0;
    diff.changes.forEach((change) => {
      expect(change.fromA).toBeGreaterThanOrEqual(previousToA);
      expect(change.toA).toBeGreaterThanOrEqual(change.fromA);
      expect(change.toA).toBeLessThanOrEqual(diff.before.content.size);
      expect(change.fromB).toBeGreaterThanOrEqual(previousToB);
      expect(change.toB).toBeGreaterThanOrEqual(change.fromB);
      expect(change.toB).toBeLessThanOrEqual(diff.after.content.size);
      previousToA = change.toA;
      previousToB = change.toB;
    });
  });
});
