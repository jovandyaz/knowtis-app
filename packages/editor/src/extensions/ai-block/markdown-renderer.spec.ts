import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { createBaseExtensions } from '../base-extensions';
import {
  markdownToFragment,
  renderMarkdownToSanitizedHtml,
} from './markdown-renderer';

describe('renderMarkdownToSanitizedHtml', () => {
  it('strips images produced by markdown image syntax', () => {
    const result = renderMarkdownToSanitizedHtml(
      '![x](https://evil.example/x)'
    );
    expect(result).not.toContain('<img');
  });

  it('renders a mermaid fence as the mermaid block element with its code', () => {
    const code = 'graph TD\n  A[Start<br/>here] --> B\n';
    const result = renderMarkdownToSanitizedHtml('```mermaid\n' + code + '```');

    const doc = new DOMParser().parseFromString(result, 'text/html');
    const block = doc.querySelector('div[data-mermaid-block]');
    expect(block?.getAttribute('data-code')).toBe(code.trim());
    expect(doc.querySelector('pre')).toBeNull();
  });

  it('keeps a non-mermaid fence as a code block', () => {
    const result = renderMarkdownToSanitizedHtml('```ts\nconst a = 1;\n```');
    expect(result).toContain('<pre><code class="language-ts">');
    expect(result).not.toContain('data-mermaid-block');
  });

  it('keeps stripping arrow-bearing attributes outside the mermaid block', () => {
    const result = renderMarkdownToSanitizedHtml(
      '[x](https://a.example "see -->")'
    );
    expect(result).toContain('<a href="https://a.example"');
    expect(result).not.toContain('title=');
  });
});

describe('markdownToFragment', () => {
  it("reads a soft line break as a space and keeps a code block's whitespace", () => {
    const fragment = markdownToFragment(
      'line one\nline two\n\n```ts\nconst a = 1;\n\n  b();\n```',
      getSchema(createBaseExtensions())
    );

    const blocks: [string, string][] = [];
    fragment.forEach((node) => {
      blocks.push([node.type.name, node.textContent]);
    });
    expect(blocks).toEqual([
      ['paragraph', 'line one line two'],
      ['codeBlock', 'const a = 1;\n\n  b();\n'],
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
      ].join('\n\n'),
      getSchema(createBaseExtensions())
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
    ]);
    expect([...marks].sort()).toEqual([
      'bold',
      'code',
      'italic',
      'link',
      'strike',
    ]);
  });
});
