import { describe, expect, it } from 'vitest';

import { htmlToMarkdown } from '@knowtis/note-markdown';

import { nodesLostBetween } from './document-fidelity';
import { markdownToNoteHtml } from './html-sanitizer';

const roundTripped = (html: string): string =>
  markdownToNoteHtml(htmlToMarkdown(html));

const NESTED_TASK_LIST =
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><div><p>book</p>' +
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>flight</p></div></li></ul>' +
  '</div></li></ul>';
const TABLE_NOTE =
  '<h2>Trip</h2><p>hi</p><table><tbody><tr><th><p>Day</p></th><th><p>Place</p></th></tr>' +
  '<tr><td><p>1</p></td><td><p>Antigua</p></td></tr></tbody></table>';

describe('nodesLostBetween', () => {
  it('reports nothing when every node survives', () => {
    expect(
      nodesLostBetween(TABLE_NOTE, roundTripped(TABLE_NOTE))
    ).toStrictEqual([]);
  });

  it('names a nested task list the second document no longer holds', () => {
    expect(
      nodesLostBetween(
        NESTED_TASK_LIST,
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><div><p>book</p></div></li></ul>'
      )
    ).toStrictEqual(['paragraph', 'taskItem', 'taskList', 'text']);
  });

  it('reports nothing when content is added rather than lost', () => {
    expect(
      nodesLostBetween(TABLE_NOTE, TABLE_NOTE + '<p>extra</p>')
    ).toStrictEqual([]);
  });

  it('names every node type the second document holds fewer of', () => {
    expect(
      nodesLostBetween(TABLE_NOTE, '<h2>Trip</h2><p>hi</p>')
    ).toStrictEqual([
      'paragraph',
      'table',
      'tableCell',
      'tableHeader',
      'tableRow',
      'text',
    ]);
  });

  it('does not count a text node of nothing but spaces as content', () => {
    expect(
      nodesLostBetween('<p>a</p><p>&nbsp; &nbsp;</p>', '<p>a</p><p></p>')
    ).toStrictEqual([]);
  });

  it('still counts a paragraph that holds text', () => {
    expect(
      nodesLostBetween('<p>a</p><p>&nbsp;b</p>', '<p>a</p><p></p>')
    ).toStrictEqual(['text']);
  });

  it('treats an unreadable document as no evidence of loss', () => {
    expect(nodesLostBetween('', '')).toStrictEqual([]);
  });
});

describe('the note shapes an edit can and cannot carry', () => {
  it.each([
    ['a table note', TABLE_NOTE],
    [
      'a mermaid block',
      '<div data-mermaid-block data-code="flowchart LR"></div>',
    ],
    [
      'a flat task list',
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>book</p></div></li></ul>',
    ],
    [
      'an image',
      '<figure data-image=""><img src="https://knowtis.public.blob.vercel-storage.com/notes/n1/a.webp" alt="a"><figcaption></figcaption></figure>',
    ],
    ['a nested task list', NESTED_TASK_LIST],
    [
      'a mermaid block with a trailing newline',
      '<div data-mermaid-block data-code="flowchart LR\n"></div>',
    ],
  ])('survives a no-op round trip: %s', (_label, html) => {
    expect(nodesLostBetween(html, roundTripped(html))).toStrictEqual([]);
  });
});
