import type { Node as PMNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from './constants';
import { isTrivialFragment, isTrivialProseMirrorDoc } from './trivial';

function makeFragment(): Y.XmlFragment {
  const doc = new Y.Doc();
  return doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
}

function makeEmptyBlock(name: string): Y.XmlElement {
  return new Y.XmlElement(name);
}

describe('isTrivialFragment', () => {
  it('returns true for an empty fragment', () => {
    expect(isTrivialFragment(makeFragment())).toBe(true);
  });

  it.each([['paragraph'], ['heading']])(
    'returns true for a single empty %s block',
    (blockName) => {
      const fragment = makeFragment();
      fragment.insert(0, [makeEmptyBlock(blockName)]);
      expect(isTrivialFragment(fragment)).toBe(true);
    }
  );

  it('returns false when the block has content', () => {
    const fragment = makeFragment();
    const p = makeEmptyBlock('paragraph');
    p.insert(0, [new Y.XmlText('hello')]);
    fragment.insert(0, [p]);
    expect(isTrivialFragment(fragment)).toBe(false);
  });

  it('returns false when there are multiple blocks', () => {
    const fragment = makeFragment();
    fragment.insert(0, [
      makeEmptyBlock('paragraph'),
      makeEmptyBlock('paragraph'),
    ]);
    expect(isTrivialFragment(fragment)).toBe(false);
  });

  it('returns false for non-recognized block shapes', () => {
    const fragment = makeFragment();
    fragment.insert(0, [makeEmptyBlock('codeBlock')]);
    expect(isTrivialFragment(fragment)).toBe(false);
  });
});

describe('isTrivialProseMirrorDoc', () => {
  interface ChildStub {
    name: string;
  }
  interface BlockStub {
    name: string;
    contentSize: number;
    children?: ChildStub[];
  }
  function makeChild(c: ChildStub) {
    return { type: { name: c.name } };
  }
  function makeBlock(block: BlockStub) {
    const children = block.children ?? [];
    return {
      type: { name: block.name },
      content: { size: block.contentSize },
      forEach: (fn: (child: { type: { name: string } }) => void) => {
        for (const c of children) {
          fn(makeChild(c));
        }
      },
    };
  }
  function makeDoc(blocks: BlockStub[]) {
    return {
      childCount: blocks.length,
      firstChild: blocks[0] ? makeBlock(blocks[0]) : null,
    } as unknown as PMNode;
  }

  it('returns true for a doc with no children', () => {
    expect(isTrivialProseMirrorDoc(makeDoc([]))).toBe(true);
  });

  it.each([['paragraph'], ['heading']])(
    'returns true for a single empty %s node',
    (name) => {
      expect(isTrivialProseMirrorDoc(makeDoc([{ name, contentSize: 0 }]))).toBe(
        true
      );
    }
  );

  it('returns true for a block whose only content is hardBreaks', () => {
    expect(
      isTrivialProseMirrorDoc(
        makeDoc([
          {
            name: 'paragraph',
            contentSize: 1,
            children: [{ name: 'hardBreak' }],
          },
        ])
      )
    ).toBe(true);
  });

  it('returns false when the single node has text content', () => {
    expect(
      isTrivialProseMirrorDoc(
        makeDoc([
          {
            name: 'paragraph',
            contentSize: 5,
            children: [{ name: 'text' }],
          },
        ])
      )
    ).toBe(false);
  });

  it('returns false for multiple children', () => {
    expect(
      isTrivialProseMirrorDoc(
        makeDoc([
          { name: 'paragraph', contentSize: 0 },
          { name: 'paragraph', contentSize: 0 },
        ])
      )
    ).toBe(false);
  });

  it('returns false for a single non-empty-block node', () => {
    expect(
      isTrivialProseMirrorDoc(makeDoc([{ name: 'codeBlock', contentSize: 0 }]))
    ).toBe(false);
  });
});
