import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAIStore } from '@/stores/ai.store';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { ChevronRight, Sparkles } from 'lucide-react';

import { Button, cn } from '@knowtis/design-system';
import { AI_ACTION, type AIAction } from '@knowtis/shared-types';

import {
  AI_BUBBLE_ACTIONS,
  SUPPORTED_LANGUAGES,
  SUPPORTED_TONES,
} from './ai-actions.config';
import type { AIActionConfig } from './ai-actions.config';

interface SubMenuListProps {
  items: ReadonlyArray<{ value: string; labelKey: string }>;
  onBack: () => void;
  onSelect: (value: string) => void;
}

function SubMenuList({ items, onBack, onSelect }: SubMenuListProps) {
  const { t } = useTranslation('notes');
  return (
    <div className="flex w-48 flex-col p-1">
      <button
        type="button"
        className="mb-1 flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ChevronRight className="h-3 w-3 rotate-180" />
        {t('ai.bubbleMenu.back')}
      </button>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={cn(
            'flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs',
            'text-foreground transition-colors hover:bg-muted'
          )}
          onClick={() => onSelect(item.value)}
        >
          {t(item.labelKey as never)}
        </button>
      ))}
    </div>
  );
}

interface AIBubbleMenuProps {
  editor: Editor;
}

type MenuView = 'trigger' | 'actions' | 'languages' | 'tones';

export function AIBubbleMenu({ editor }: AIBubbleMenuProps) {
  const { t } = useTranslation('notes');
  const { status, startStream, setSelectionRange } = useAIStore();
  const [menuView, setMenuView] = useState<MenuView>('trigger');

  const isActive = status !== 'idle';

  const getSelectedText = useCallback(() => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, ' ');
  }, [editor]);

  const getFullContent = useCallback(() => {
    return editor.state.doc.textContent;
  }, [editor]);

  const handleAction = useCallback(
    (action: AIAction, targetLanguage?: string, targetTone?: string) => {
      const { from, to } = editor.state.selection;
      const selection = getSelectedText();
      const content = getFullContent();

      setSelectionRange({ from, to });

      startStream({
        action,
        content,
        selection,
        ...(targetLanguage ? { targetLanguage } : {}),
        ...(targetTone ? { targetTone } : {}),
      });
      setMenuView('trigger');
    },
    [editor, getSelectedText, getFullContent, startStream, setSelectionRange]
  );

  const handleActionClick = useCallback(
    (actionConfig: AIActionConfig) => {
      if (actionConfig.needsSubMenu === 'languages') {
        setMenuView('languages');
        return;
      }
      if (actionConfig.needsSubMenu === 'tones') {
        setMenuView('tones');
        return;
      }
      handleAction(actionConfig.action);
    },
    [handleAction]
  );

  const shouldShow = useCallback(
    ({ from, to }: { from: number; to: number }) => {
      if (isActive) {
        return false;
      }
      if (from === to) {
        return false;
      }
      const text = editor.state.doc.textBetween(from, to, ' ');
      return text.trim().length > 0;
    },
    [editor, isActive]
  );

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShow}
      options={{
        placement: 'top',
        offset: 8,
      }}
    >
      <div
        className={cn(
          'flex flex-col items-start',
          'rounded-xl border border-border bg-card shadow-lg backdrop-blur-md',
          'animate-in fade-in slide-in-from-top-2 duration-200'
        )}
      >
        {/* Trigger button */}
        {menuView === 'trigger' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-xl px-3 text-xs font-medium"
            onClick={() => setMenuView('actions')}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t('ai.bubbleMenu.askAI')}
          </Button>
        )}

        {/* Actions dropdown */}
        {menuView === 'actions' && (
          <div className="flex w-56 flex-col p-1">
            {AI_BUBBLE_ACTIONS.map((actionConfig) => {
              const Icon = actionConfig.icon;
              return (
                <button
                  key={actionConfig.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs',
                    'text-foreground transition-colors hover:bg-muted'
                  )}
                  onClick={() => handleActionClick(actionConfig)}
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1">
                    {t(actionConfig.labelKey as never)}
                  </span>
                  {actionConfig.needsSubMenu && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Languages sub-menu */}
        {menuView === 'languages' && (
          <SubMenuList
            items={SUPPORTED_LANGUAGES}
            onBack={() => setMenuView('actions')}
            onSelect={(value) => handleAction(AI_ACTION.TRANSLATE, value)}
          />
        )}

        {/* Tones sub-menu */}
        {menuView === 'tones' && (
          <SubMenuList
            items={SUPPORTED_TONES}
            onBack={() => setMenuView('actions')}
            onSelect={(value) => handleAction(AI_ACTION.TONE, undefined, value)}
          />
        )}
      </div>
    </BubbleMenu>
  );
}
