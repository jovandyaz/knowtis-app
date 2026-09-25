import { describe, expect, it } from 'vitest';

import { htmlToMarkdown, markdownToHtml } from '@knowtis/note-markdown';
import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { AI_BLOCK_NAME } from './ai-block-node';
import {
  nodesLostBetween,
  nodesWithoutMarkdown,
  nodesWithoutMarkdownLostBetween,
} from './document-fidelity';

const STORED_SRC = `https://${STORED_IMAGE_HOST}/notes/n1/a.webp`;
const FOREIGN_SRC = 'https://attacker.example/x.png';

const roundTripped = (html: string): string =>
  markdownToHtml(htmlToMarkdown(html));

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

  it('names a mark the second document no longer carries', () => {
    expect(nodesLostBetween('<p><u>all</u></p>', '<p>all</p>')).toStrictEqual([
      'underline',
    ]);
  });

  it('reports nothing when a mark only moves off the space at its edge', () => {
    expect(
      nodesLostBetween(
        '<p><strong>a </strong>b</p>',
        '<p><strong>a</strong> b</p>'
      )
    ).toStrictEqual([]);
  });

  it('does not count an image the app never stored, nor its caption', () => {
    expect(
      nodesLostBetween(
        `<p>a</p><figure data-image=""><img src="${FOREIGN_SRC}" alt="x"><figcaption>cap</figcaption></figure>`,
        '<p>a</p>'
      )
    ).toStrictEqual([]);
  });

  it('does not count a figure whose foreign src the schema already omitted', () => {
    expect(
      nodesLostBetween(
        '<p>a</p><figure data-image=""><img alt="x"><figcaption></figcaption></figure>',
        '<p>a</p>'
      )
    ).toStrictEqual([]);
  });

  it('still counts an image the app stored', () => {
    expect(
      nodesLostBetween(
        `<p>a</p><figure data-image=""><img src="${STORED_SRC}" alt="x"><figcaption></figcaption></figure>`,
        '<p>a</p>'
      )
    ).toStrictEqual(['image']);
  });

  it('treats an unreadable document as no evidence of loss', () => {
    expect(nodesLostBetween('', '')).toStrictEqual([]);
  });
});

const AI_BLOCK =
  '<div data-ai-block="" topic="Rome" status="done" content="Rome was founded in 753 BC."></div>';

describe('nodesWithoutMarkdown', () => {
  it('keeps only the types Markdown has no form for', () => {
    expect(
      nodesWithoutMarkdown(['paragraph', AI_BLOCK_NAME, 'table'])
    ).toStrictEqual([AI_BLOCK_NAME]);
  });
});

describe('nodesWithoutMarkdownLostBetween', () => {
  it('names an AI block a rewrite no longer holds', () => {
    expect(
      nodesWithoutMarkdownLostBetween(`<p>Old</p>${AI_BLOCK}`, '<p>New</p>')
    ).toStrictEqual([AI_BLOCK_NAME]);
  });

  it('names an AI block a rewrite to nothing would delete', () => {
    expect(
      nodesWithoutMarkdownLostBetween(`<p>Old</p>${AI_BLOCK}`, '')
    ).toStrictEqual([AI_BLOCK_NAME]);
  });

  it('ignores every other node a rewrite removes, since Markdown showed it', () => {
    expect(
      nodesWithoutMarkdownLostBetween(TABLE_NOTE, '<p>New</p>')
    ).toStrictEqual([]);
  });

  it('reports nothing when the AI block is still there', () => {
    expect(
      nodesWithoutMarkdownLostBetween(
        `<p>Old</p>${AI_BLOCK}`,
        `<p>New</p>${AI_BLOCK}`
      )
    ).toStrictEqual([]);
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
      '<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/a.webp" alt="a"><figcaption></figcaption></figure>',
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
