import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import DOMPurify from 'dompurify';
import { Check, GraduationCap, Loader2, RotateCcw, X } from 'lucide-react';

import { useLearnTopic } from '@knowtis/data-access-artifacts';
import { Button, Input } from '@knowtis/design-system';

import { AI_BLOCK_STATUS, type AIBlockAttributes } from './AIBlockNode';

const MIN_TOPIC_LENGTH = 2;

export function AIBlockView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
}: NodeViewProps) {
  const { t } = useTranslation('notes');
  const attrs = node.attrs as AIBlockAttributes;
  const [topicInput, setTopicInput] = useState(attrs.topic);
  const learnTopic = useLearnTopic();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (attrs.status === AI_BLOCK_STATUS.INPUT && inputRef.current) {
      inputRef.current.focus();
    }
  }, [attrs.status]);

  const mutationCallbacks = useMemo(
    () => ({
      onSuccess: (data: { content: string }) => {
        if (cancelledRef.current) {
          return;
        }
        updateAttributes({
          status: AI_BLOCK_STATUS.DONE,
          content: data.content,
        });
      },
      onError: (error: unknown) => {
        if (cancelledRef.current) {
          return;
        }
        updateAttributes({
          status: AI_BLOCK_STATUS.ERROR,
          errorMessage:
            error instanceof Error
              ? error.message
              : t('ai.aiBlock.errorGeneric'),
        });
      },
    }),
    [updateAttributes, t]
  );

  const handleGenerate = useCallback(() => {
    const topic = topicInput.trim();
    if (topic.length < MIN_TOPIC_LENGTH) {
      return;
    }

    cancelledRef.current = false;
    updateAttributes({ status: AI_BLOCK_STATUS.LOADING, topic });
    learnTopic.mutate(topic, mutationCallbacks);
  }, [topicInput, updateAttributes, learnTopic, mutationCallbacks]);

  const handleInsert = useCallback(() => {
    if (typeof getPos !== 'function') {
      return;
    }
    const pos = getPos();
    if (pos == null) {
      return;
    }

    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(pos, attrs.content)
      .run();
  }, [editor, getPos, node.nodeSize, attrs.content]);

  const handleRetry = useCallback(() => {
    cancelledRef.current = false;
    updateAttributes({
      status: AI_BLOCK_STATUS.LOADING,
      content: '',
      errorMessage: '',
    });
    learnTopic.mutate(attrs.topic, mutationCallbacks);
  }, [attrs.topic, updateAttributes, learnTopic, mutationCallbacks]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    learnTopic.reset();
    updateAttributes({ status: AI_BLOCK_STATUS.INPUT });
  }, [learnTopic, updateAttributes]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (attrs.status === AI_BLOCK_STATUS.LOADING) {
          handleCancel();
        } else {
          deleteNode();
        }
      }
    },
    [attrs.status, deleteNode, handleCancel]
  );

  useEffect(() => {
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
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <GraduationCap className="h-4 w-4" />
              <span className="text-sm font-medium">
                {t('ai.aiBlock.title')}
              </span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleGenerate();
              }}
              className="flex gap-2"
            >
              <Input
                ref={inputRef}
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder={t('ai.aiBlock.placeholder')}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={topicInput.trim().length < MIN_TOPIC_LENGTH}
              >
                {t('ai.aiBlock.generate')}
              </Button>
            </form>
          </div>
        )}

        {attrs.status === AI_BLOCK_STATUS.LOADING && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">
                  {t('ai.aiBlock.generating')}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                {t('ai.aiBlock.cancel')}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-3/4 rounded bg-primary/10 animate-pulse" />
              <div className="h-4 w-full rounded bg-primary/10 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-primary/10 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-primary/10 animate-pulse" />
            </div>
          </div>
        )}

        {attrs.status === AI_BLOCK_STATUS.DONE && (
          <div>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleInsert}>
                  <Check className="mr-1 h-3 w-3" />
                  {t('ai.aiBlock.insert')}
                </Button>
                <Button variant="ghost" size="icon" onClick={handleRetry}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" onClick={deleteNode}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div
              className="px-4 pb-4 prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_code]:text-xs"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(attrs.content),
              }}
            />
          </div>
        )}

        {attrs.status === AI_BLOCK_STATUS.ERROR && (
          <div className="p-4 space-y-3">
            <p className="text-sm text-destructive">{attrs.errorMessage}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RotateCcw className="mr-1 h-3 w-3" />
                {t('ai.aiBlock.retry')}
              </Button>
              <Button variant="ghost" size="sm" onClick={deleteNode}>
                <X className="mr-1 h-3 w-3" />
                {t('ai.aiBlock.discard')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
