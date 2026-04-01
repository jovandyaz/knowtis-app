import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import DOMPurify from 'dompurify';
import { Check, GraduationCap, Loader2, RotateCcw, X } from 'lucide-react';
import MarkdownIt from 'markdown-it';
import { Streamdown } from 'streamdown';

import { aiClient, type AIStreamHandle } from '@knowtis/api-client';
import {
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

import { AI_BLOCK_STATUS, type AIBlockAttributes } from './AIBlockNode';

const MARKDOWN_RENDERER = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});
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
  const [streamedText, setStreamedText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);
  const streamHandleRef = useRef<AIStreamHandle | null>(null);

  useEffect(() => {
    if (attrs.status === AI_BLOCK_STATUS.INPUT) {
      // Use requestAnimationFrame to ensure the input is mounted before focusing
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [attrs.status]);

  useEffect(() => {
    return () => {
      streamHandleRef.current?.cancel();
    };
  }, []);

  const startStream = useCallback(
    (topic: string) => {
      cancelledRef.current = false;
      setStreamedText('');
      updateAttributes({ status: AI_BLOCK_STATUS.STREAMING, topic });

      const accumulated: string[] = [];
      streamHandleRef.current = aiClient.stream(
        { action: 'learn-topic', content: topic },
        {
          onChunk: ({ text }) => {
            accumulated.push(text);
            setStreamedText(accumulated.join(''));
          },
          onDone: () => {
            if (cancelledRef.current) {
              return;
            }
            updateAttributes({
              status: AI_BLOCK_STATUS.DONE,
              content: accumulated.join(''),
            });
          },
          onError: (error) => {
            if (cancelledRef.current) {
              return;
            }
            updateAttributes({
              status: AI_BLOCK_STATUS.ERROR,
              errorMessage: error.message ?? t('ai.aiBlock.errorGeneric'),
            });
          },
        }
      );
    },
    [updateAttributes, t]
  );

  const handleGenerate = useCallback(() => {
    const topic = topicInput.trim();
    if (topic.length < MIN_TOPIC_LENGTH) {
      return;
    }
    startStream(topic);
  }, [topicInput, startStream]);

  const handleInsert = useCallback(() => {
    if (typeof getPos !== 'function') {
      return;
    }
    const pos = getPos();
    if (pos == null) {
      return;
    }

    const html = DOMPurify.sanitize(MARKDOWN_RENDERER.render(attrs.content));
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(pos, html)
      .run();
  }, [editor, getPos, node.nodeSize, attrs.content]);

  const handleRetry = useCallback(() => {
    startStream(attrs.topic);
  }, [attrs.topic, startStream]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    streamHandleRef.current?.cancel();
    updateAttributes({ status: AI_BLOCK_STATUS.INPUT });
  }, [updateAttributes]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (attrs.status === AI_BLOCK_STATUS.STREAMING) {
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <GraduationCap className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {t('ai.aiBlock.title')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={deleteNode}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
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

        {attrs.status === AI_BLOCK_STATUS.STREAMING && (
          <div className="space-y-3 p-4">
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
            {streamedText ? (
              <Streamdown isAnimating>{streamedText}</Streamdown>
            ) : (
              <div className="space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-primary/10" />
                <div className="h-4 w-full animate-pulse rounded bg-primary/10" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-primary/10" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-primary/10" />
              </div>
            )}
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleRetry}>
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('ai.aiBlock.retry')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={deleteNode}>
                      <X className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('ai.aiBlock.discard')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="px-4 pb-4">
              <Streamdown mode="static">{attrs.content}</Streamdown>
            </div>
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
