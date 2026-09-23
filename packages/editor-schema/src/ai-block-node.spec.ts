import type { JSONContent } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html/server';
import { describe, expect, it } from 'vitest';

import { AI_BLOCK_NAME, AI_BLOCK_STATUS } from './ai-block-node';
import { createSemanticExtensions } from './semantic-extensions';

const extensions = [...createSemanticExtensions()];

const DONE_BLOCK: JSONContent = {
  type: 'doc',
  content: [
    {
      type: AI_BLOCK_NAME,
      attrs: {
        topic: 'Rome "the city" & <empire>',
        status: AI_BLOCK_STATUS.DONE,
        content: '# Rome\n\nFounded in **753 BC**',
        errorMessage: '',
      },
    },
  ],
};

const DONE_BLOCK_HTML =
  '<div topic="Rome &quot;the city&quot; &amp; <empire>" status="done" content="# Rome\n\nFounded in **753 BC**" errormessage="" data-ai-block=""></div>';

describe('AIBlockNode', () => {
  it('renders the block with its attributes and no text of its own', () => {
    expect(generateHTML(DONE_BLOCK, extensions)).toBe(DONE_BLOCK_HTML);
  });

  it('parses the rendered block back into the same node', () => {
    expect(generateJSON(DONE_BLOCK_HTML, extensions)).toEqual(DONE_BLOCK);
  });

  it('gives a bare block the input status and empty attributes', () => {
    expect(generateJSON('<div data-ai-block=""></div>', extensions)).toEqual({
      type: 'doc',
      content: [
        {
          type: AI_BLOCK_NAME,
          attrs: {
            topic: '',
            status: AI_BLOCK_STATUS.INPUT,
            content: '',
            errorMessage: '',
          },
        },
      ],
    });
  });
});
