import { useCallback, useEffect, useRef } from 'react';

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';

import { AIBlockError } from './AIBlockError';
import { AIBlockInputForm } from './AIBlockInputForm';
import {
  AI_BLOCK_STATUS,
  type AIBlockAttributes,
  type AIBlockStatus,
} from './AIBlockNode';
import { AIBlockResult } from './AIBlockResult';
import { AIBlockStreaming } from './AIBlockStreaming';
import { renderMarkdownToSanitizedHtml } from './markdown-renderer';
import { useAIBlockStream } from './useAIBlockStream';

function readAttrs(node: ProseMirrorNode): AIBlockAttributes {
  const status = node.attrs['status'];
  const topic = node.attrs['topic'];
  const content = node.attrs['content'];
  const errorMessage = node.attrs['errorMessage'];
  return {
    topic: typeof topic === 'string' ? topic : '',
    status:
      typeof status === 'string'
        ? (status as AIBlockStatus)
        : AI_BLOCK_STATUS.INPUT,
    content: typeof content === 'string' ? content : '',
    errorMessage: typeof errorMessage === 'string' ? errorMessage : '',
  };
}

export function AIBlockView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
}: NodeViewProps) {
  const attrs = readAttrs(node);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { streamedText, start, cancel, retry } = useAIBlockStream(
    editor,
    updateAttributes
  );

  const handleInsert = useCallback(() => {
    if (typeof getPos !== 'function') {
      return;
    }
    let pos: number | undefined;
    try {
      pos = getPos();
    } catch {
      return;
    }
    if (pos == null) {
      return;
    }

    const html = renderMarkdownToSanitizedHtml(attrs.content);
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(pos, html)
      .run();
  }, [editor, getPos, node.nodeSize, attrs.content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (attrs.status === AI_BLOCK_STATUS.STREAMING) {
          cancel();
        } else {
          deleteNode();
        }
      }
    },
    [attrs.status, deleteNode, cancel]
  );

  useEffect(() => {
    // Focus wrapper on mount so Escape works without an additional click.
    wrapperRef.current?.focus();
  }, []);

  return (
    <NodeViewWrapper>
      <div
        ref={wrapperRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        contentEditable={false}
        className="my-4 rounded-lg border border-primary/20 bg-primary/5 overflow-hidden outline-none"
      >
        {attrs.status === AI_BLOCK_STATUS.INPUT && (
          <AIBlockInputForm
            initialTopic={attrs.topic}
            onSubmit={start}
            onDiscard={deleteNode}
          />
        )}

        {attrs.status === AI_BLOCK_STATUS.STREAMING && (
          <AIBlockStreaming streamedText={streamedText} onCancel={cancel} />
        )}

        {attrs.status === AI_BLOCK_STATUS.DONE && (
          <AIBlockResult
            content={attrs.content}
            onInsert={handleInsert}
            onRetry={() => retry(attrs.topic)}
            onDiscard={deleteNode}
          />
        )}

        {attrs.status === AI_BLOCK_STATUS.ERROR && (
          <AIBlockError
            errorMessage={attrs.errorMessage}
            onRetry={() => retry(attrs.topic)}
            onDiscard={deleteNode}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}
