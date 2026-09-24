import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { createBaseExtensions } from '../base-extensions';
import { markdownToFragment } from './markdown-renderer';

const SCHEMA = getSchema(createBaseExtensions());

describe('markdownToFragment', () => {
  it('drops an image written in markdown image syntax', () => {
    expect(
      markdownToFragment('![x](https://evil.example/x) after', SCHEMA).toJSON()
    ).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
    ]);
  });

  it('drops a captioned image together with its caption', () => {
    expect(
      markdownToFragment(
        '![x](https://evil.example/x "a caption") after',
        SCHEMA
      ).toJSON()
    ).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
    ]);
  });

  it('turns a mermaid fence into a mermaid block holding its whole code without the closing newline', () => {
    const fragment = markdownToFragment(
      '```mermaid\ngraph TD\n  A[Start<br/>here] --> B\n```',
      SCHEMA
    );

    expect(fragment.childCount).toBe(1);
    expect(fragment.child(0).type.name).toBe('mermaidBlock');
    expect(fragment.child(0).attrs['code']).toBe(
      'graph TD\n  A[Start<br/>here] --> B'
    );
  });

  it('keeps a non-mermaid fence as a code block with its language', () => {
    const fragment = markdownToFragment('```ts\nconst a = 1;\n```', SCHEMA);

    expect(fragment.childCount).toBe(1);
    expect(fragment.child(0).type.name).toBe('codeBlock');
    expect(fragment.child(0).attrs['language']).toBe('ts');
  });

  it('keeps stripping arrow-bearing attributes outside the mermaid block', () => {
    const fragment = markdownToFragment(
      '[x](https://a.example "see -->") [y](https://b.example "plain")',
      SCHEMA
    );

    const links: unknown[] = [];
    fragment.descendants((node) => {
      node.marks.forEach((mark) =>
        links.push([mark.attrs['href'], mark.attrs['title']])
      );
    });
    expect(links).toEqual([
      ['https://a.example', null],
      ['https://b.example', 'plain'],
    ]);
  });

  it("reads a soft line break as a space and keeps a code block's whitespace", () => {
    const fragment = markdownToFragment(
      'line one\nline two\n\n```ts\nconst a = 1;\n\n  b();\n```',
      SCHEMA
    );

    const blocks: [string, string][] = [];
    fragment.forEach((node) => {
      blocks.push([node.type.name, node.textContent]);
    });
    expect(blocks).toEqual([
      ['paragraph', 'line one line two'],
      ['codeBlock', 'const a = 1;\n\n  b();'],
    ]);
  });

  it('keeps every construct markdown hands it', () => {
    const fragment = markdownToFragment(
      [
        '# One',
        '## Two',
        '**b** *i* ~~s~~ `c` [l](https://example.com)',
        '- a\n- b',
        '3. c',
        '> q',
        '```ts\nx\n```',
        '---',
        '| h | k |\n| - | - |\n| 1 | 2 |',
        '```mermaid\ngraph TD\n  A --> B\n```',
        '- [ ] t',
        '++u++',
      ].join('\n\n'),
      SCHEMA
    );

    const blocks: string[] = [];
    const marks = new Set<string>();
    fragment.forEach((node) => {
      blocks.push(node.type.name);
      node.descendants((child) => {
        child.marks.forEach((mark) => marks.add(mark.type.name));
      });
    });
    expect(blocks).toEqual([
      'heading',
      'heading',
      'paragraph',
      'bulletList',
      'orderedList',
      'blockquote',
      'codeBlock',
      'horizontalRule',
      'table',
      'mermaidBlock',
      'taskList',
      'paragraph',
    ]);
    expect([...marks].sort()).toEqual([
      'bold',
      'code',
      'italic',
      'link',
      'strike',
      'underline',
    ]);
  });
});
