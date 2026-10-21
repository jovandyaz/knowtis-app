import { StrictMode } from 'react';

import { useAIStore } from '@/stores/ai.store';
import { createCollaborativeEditor } from '@/test/collaborative-editor';
import {
  act,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react';
import type { Editor, Range } from '@tiptap/react';
import type * as StreamdownModule from 'streamdown';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as Y from 'yjs';

import type * as ApiClientModule from '@knowtis/api-client';
import { aiClient } from '@knowtis/api-client';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import {
  AI_MENU_ACTIONS,
  AI_MENU_CONTEXT,
  executeAIAction,
  type AIMenuContext,
} from './ai-actions.config';
import { AIResultPanel } from './AIResultPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { popperUpdate } = vi.hoisted(() => ({ popperUpdate: vi.fn() }));

vi.mock('tippy.js', () => ({
  default: (
    _reference: Element,
    {
      content,
      getReferenceClientRect,
    }: { content: HTMLElement; getReferenceClientRect: () => unknown }
  ) => {
    document.body.appendChild(content);
    return {
      popperInstance: {
        update: () => {
          popperUpdate();
          getReferenceClientRect();
        },
      },
      destroy: () => content.remove(),
    };
  },
}));

vi.mock('streamdown', async (importOriginal) => ({
  ...(await importOriginal<typeof StreamdownModule>()),
  Streamdown: () => null,
}));

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  aiClient: { stream: vi.fn() },
}));

vi.mock('@/lib/analytics/product-events', () => ({
  captureProductEvent: vi.fn(),
}));

type StreamCallbacks = Parameters<typeof aiClient.stream>[1];

interface StartedStream {
  callbacks: StreamCallbacks;
  cancel: Mock<() => void>;
}

const SENTENCE = '<p>alpha beta gamma</p>';
const OTHER_NOTE = '<p>another note</p>';
const THREE_PARAGRAPHS = '<p>aaa</p><p>bbb</p><p>ccc</p>';
const LIST_NOTE =
  '<p>intro</p><ul><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li></ul><p>tail</p>';
const FIRST_PARAGRAPH = { from: 0, to: 5 };
const FIRST_LIST_ITEM = { from: 8, to: 15 };
const BETA = { from: 7, to: 11 };
const SENTENCE_END = { from: 17, to: 17 };
const RESULT = 'BETA';
const REPLACE = 'ai.preview.replace';
const INSERT_BELOW = 'ai.preview.insertBelow';
const IMPROVE_WRITING = 'improve';
const CONTINUE_WRITING = 'ai-continue';

function textOf(doc: Y.Doc, blockIndex: number): Y.XmlText {
  const block = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME).get(blockIndex);
  const text = block instanceof Y.XmlElement ? block.get(0) : null;
  if (!(text instanceof Y.XmlText)) {
    throw new Error(`block ${blockIndex} holds no text`);
  }
  return text;
}

function paragraph(text: string): Y.XmlElement {
  const block = new Y.XmlElement('paragraph');
  block.insert(0, [new Y.XmlText(text)]);
  return block;
}

function textblocks(editor: Editor): string[] {
  const found: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.isTextblock) {
      found.push(node.textContent);
      return false;
    }
    return true;
  });
  return found;
}

function blocks(editor: Editor): string[] {
  const found: string[] = [];
  editor.state.doc.forEach((node) => {
    found.push(node.textContent);
  });
  return found;
}

describe('AIResultPanel on a document others keep editing', () => {
  const opened: { editor: Editor; doc: Y.Doc }[] = [];

  afterEach(() => {
    act(() => {
      useAIStore.getState().reset();
    });
    for (const { editor, doc } of opened.splice(0)) {
      editor.destroy();
      doc.destroy();
    }
    vi.clearAllMocks();
  });

  function openEditor(content: string): Editor {
    const { editor: live, doc } = createCollaborativeEditor(content);
    opened.push({ editor: live, doc });
    return live;
  }

  function localDoc(): Y.Doc {
    const first = opened[0];
    if (!first) {
      throw new Error('no local document');
    }
    return first.doc;
  }

  function startAction(
    live: Editor,
    selection: Range,
    actionId = IMPROVE_WRITING,
    context: AIMenuContext = AI_MENU_CONTEXT.SELECTION
  ): StartedStream {
    const config = AI_MENU_ACTIONS.find((action) => action.id === actionId);
    if (!config) {
      throw new Error(`no AI action ${actionId}`);
    }
    let callbacks: StreamCallbacks | null = null;
    const cancel = vi.fn<() => void>();
    vi.mocked(aiClient.stream).mockImplementation((_payload, received) => {
      callbacks = received;
      return { cancel };
    });
    live.commands.setTextSelection(selection);
    executeAIAction({ editor: live, config, context });
    if (!callbacks) {
      throw new Error('stream was not started');
    }
    return { callbacks, cancel };
  }

  function finish({ callbacks }: StartedStream, text: string) {
    act(() => {
      callbacks.onChunk({ text });
      callbacks.onDone({
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          model: 'test',
          costUsd: 0,
        },
      });
    });
  }

  function joinCollaborator(): Y.Doc {
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(localDoc()));
    return remote;
  }

  function receiveFrom(remote: Y.Doc) {
    const target = localDoc();
    act(() => {
      Y.applyUpdate(
        target,
        Y.encodeStateAsUpdate(remote, Y.encodeStateVector(target))
      );
    });
  }

  function choose(action: string) {
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: action }));
    });
  }

  it('replaces only the selected words after the user typed before them', () => {
    const live = openEditor(SENTENCE);
    const stream = startAction(live, BETA);
    render(<AIResultPanel editor={live} />);

    act(() => {
      live.commands.insertContentAt(1, 'local ');
    });
    finish(stream, RESULT);
    choose(REPLACE);

    expect(blocks(live)).toEqual(['local alpha BETA gamma']);
  });

  it('replaces only the selected words after a collaborator typed before them', () => {
    const live = openEditor(SENTENCE);
    const stream = startAction(live, BETA);
    render(<AIResultPanel editor={live} />);
    const remote = joinCollaborator();

    textOf(remote, 0).insert(0, 'remote ');
    receiveFrom(remote);
    finish(stream, RESULT);
    choose(REPLACE);

    expect(blocks(live)).toEqual(['remote alpha BETA gamma']);
  });

  it('keeps text a collaborator typed at either edge of the selection', () => {
    const live = openEditor(SENTENCE);
    const stream = startAction(live, BETA);
    render(<AIResultPanel editor={live} />);
    const remote = joinCollaborator();

    textOf(remote, 0).insert('alpha beta'.length, ']');
    textOf(remote, 0).insert('alpha '.length, '[');
    receiveFrom(remote);
    finish(stream, RESULT);
    choose(REPLACE);

    expect(blocks(live)).toEqual(['alpha [BETA] gamma']);
  });

  it('inserts the answer where the selection was once a collaborator deleted it, deleting nothing else', () => {
    const live = openEditor(SENTENCE);
    const stream = startAction(live, BETA);
    render(<AIResultPanel editor={live} />);
    const remote = joinCollaborator();

    textOf(remote, 0).delete('alpha '.length, 'beta'.length);
    receiveFrom(remote);
    finish(stream, RESULT);
    choose(REPLACE);

    expect(blocks(live)).toEqual(['alpha BETA gamma']);
  });

  it('deletes nothing once a collaborator removed the whole paragraph the selection was in', () => {
    const live = openEditor(`<p>one</p>${SENTENCE}<p>omega</p>`);
    const stream = startAction(live, { from: 12, to: 16 });
    render(<AIResultPanel editor={live} />);
    const remote = joinCollaborator();

    remote.getXmlFragment(YJS_XML_FRAGMENT_NAME).delete(1, 1);
    receiveFrom(remote);
    act(() => {
      live.commands.setTextSelection({ from: 6, to: 11 });
    });
    const remaining = live.getText();
    finish(stream, RESULT);
    choose(REPLACE);

    expect(live.getText()).toContain(RESULT);
    expect(live.getText().replace(RESULT, '')).toBe(remaining);
  });

  it.each([
    [
      'locally',
      (live: Editor) => {
        act(() => {
          live.commands.deleteRange(FIRST_PARAGRAPH);
        });
      },
    ],
    [
      'by a collaborator',
      () => {
        const remote = joinCollaborator();
        remote.getXmlFragment(YJS_XML_FRAGMENT_NAME).delete(0, 1);
        receiveFrom(remote);
      },
    ],
  ])(
    'deletes nothing past a selection whose first paragraph was deleted %s',
    (_deleted, deleteFirstParagraph) => {
      const live = openEditor(THREE_PARAGRAPHS);
      const stream = startAction(live, { from: 2, to: 8 });
      render(<AIResultPanel editor={live} />);

      deleteFirstParagraph(live);
      finish(stream, RESULT);
      choose(REPLACE);

      expect(blocks(live)).toEqual([`bb${RESULT}b`, 'ccc']);
    }
  );

  it.each([
    [
      'locally',
      (live: Editor) => {
        act(() => {
          live.commands.deleteRange(FIRST_LIST_ITEM);
        });
      },
    ],
    [
      'by a collaborator',
      () => {
        const remote = joinCollaborator();
        const list = remote.getXmlFragment(YJS_XML_FRAGMENT_NAME).get(1);
        if (!(list instanceof Y.XmlElement)) {
          throw new Error('no list in the note');
        }
        list.delete(0, 1);
        receiveFrom(remote);
      },
    ],
  ])(
    'deletes nothing past a selection whose last list item was deleted %s',
    (_deleted, deleteFirstItem) => {
      const live = openEditor(LIST_NOTE);
      const stream = startAction(live, { from: 3, to: 12 });
      render(<AIResultPanel editor={live} />);

      deleteFirstItem(live);
      finish(stream, RESULT);
      choose(REPLACE);

      expect(textblocks(live)).toEqual([
        `in${RESULT}tro`,
        'two',
        'three',
        'tail',
      ]);
    }
  );

  it('keeps text a collaborator typed at the cursor an answer is written for', () => {
    const live = openEditor(SENTENCE);
    const stream = startAction(
      live,
      SENTENCE_END,
      CONTINUE_WRITING,
      AI_MENU_CONTEXT.CURSOR
    );
    render(<AIResultPanel editor={live} />);
    const remote = joinCollaborator();

    textOf(remote, 0).insert('alpha beta gamma'.length, ' delta');
    receiveFrom(remote);
    finish(stream, RESULT);
    choose(REPLACE);

    expect(blocks(live)).toEqual([`alpha beta gamma${RESULT} delta`]);
  });

  it('inserts below the selected block after a collaborator added a block above it', () => {
    const live = openEditor(`${SENTENCE}<p>omega</p>`);
    const stream = startAction(live, BETA);
    render(<AIResultPanel editor={live} />);
    const remote = joinCollaborator();

    remote
      .getXmlFragment(YJS_XML_FRAGMENT_NAME)
      .insert(0, [paragraph('remote intro')]);
    receiveFrom(remote);
    finish(stream, RESULT);
    choose(INSERT_BELOW);

    expect(blocks(live)).toEqual([
      'remote intro',
      'alpha beta gamma',
      RESULT,
      'omega',
    ]);
  });

  it('moves the preview with the selection while others edit the note', () => {
    const live = openEditor(SENTENCE);
    startAction(live, BETA);
    render(<AIResultPanel editor={live} />);
    const remote = joinCollaborator();

    textOf(remote, 0).insert(0, 'remote ');
    receiveFrom(remote);

    expect(live.view.coordsAtPos).toHaveBeenLastCalledWith(
      BETA.to + 'remote '.length
    );
  });

  it.each([
    [
      'the panel follows another editor',
      (view: RenderResult, next: Editor) => {
        view.rerender(<AIResultPanel editor={next} />);
      },
    ],
    [
      'another editor mounts its own panel',
      (view: RenderResult, next: Editor) => {
        view.unmount();
        render(<AIResultPanel editor={next} />);
      },
    ],
  ])('drops the preview and aborts its stream when %s', (_switch, switchTo) => {
    const first = openEditor(SENTENCE);
    const second = openEditor(OTHER_NOTE);
    const stream = startAction(first, BETA);
    const view = render(<AIResultPanel editor={first} />);

    switchTo(view, second);
    finish(stream, RESULT);

    expect(stream.cancel).toHaveBeenCalled();
    expect(useAIStore.getState().status).toBe('idle');
    expect(screen.queryByRole('button', { name: REPLACE })).toBeNull();
    expect(blocks(second)).toEqual(['another note']);
  });

  it('keeps a preview started after a StrictMode remount of the panel', () => {
    const live = openEditor(SENTENCE);
    render(
      <StrictMode>
        <AIResultPanel editor={live} />
      </StrictMode>
    );

    const stream = startAction(live, BETA);
    finish(stream, RESULT);

    expect(stream.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: REPLACE })).toBeInTheDocument();
  });

  it('stops following edits once the panel is gone', () => {
    const live = openEditor(SENTENCE);
    const stream = startAction(live, BETA);
    const view = render(<AIResultPanel editor={live} />);
    finish(stream, RESULT);
    act(() => {
      live.commands.insertContentAt(1, 'now ');
    });
    expect(popperUpdate).toHaveBeenCalled();

    view.unmount();
    popperUpdate.mockClear();
    act(() => {
      live.commands.insertContentAt(1, 'later ');
    });

    expect(popperUpdate).not.toHaveBeenCalled();
  });
});
