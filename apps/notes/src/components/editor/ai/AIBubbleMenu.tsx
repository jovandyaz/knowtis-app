import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAIStore } from '@/stores/ai.store';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import {
  cn,
  CommandMenuBack,
  CommandMenuContent,
  CommandMenuGroup,
  CommandMenuItem,
} from '@knowtis/design-system';
import { AI_ACTION, type AIAction } from '@knowtis/shared-types';

import {
  AI_BUBBLE_ACTIONS,
  SUPPORTED_LANGUAGES,
  SUPPORTED_TONES,
} from './ai-actions.config';
import type { AIActionConfig } from './ai-actions.config';

interface SubMenuViewProps {
  motionKey: string;
  backLabel: string;
  items: ReadonlyArray<{ value: string; labelKey: string }>;
  selectedIndex: number;
  onBack: () => void;
  onSelect: (value: string) => void;
  onIndexChange: (index: number) => void;
}

function SubMenuView({
  motionKey,
  backLabel,
  items,
  selectedIndex,
  onBack,
  onSelect,
  onIndexChange,
}: SubMenuViewProps) {
  const { t } = useTranslation('notes');
  return (
    <motion.div key={motionKey} {...crossfadeVariants}>
      <CommandMenuContent
        width="sm"
        className="border-0 shadow-none backdrop-blur-none"
      >
        <CommandMenuGroup>
          <CommandMenuBack label={backLabel} onClick={onBack} />
          {items.map((item, index) => (
            <CommandMenuItem
              key={item.value}
              label={t(item.labelKey as never)}
              selected={index === selectedIndex}
              onClick={() => onSelect(item.value)}
              onMouseEnter={() => onIndexChange(index)}
            />
          ))}
        </CommandMenuGroup>
      </CommandMenuContent>
    </motion.div>
  );
}

const crossfadeVariants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.15,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.1, ease: 'easeIn' as const },
  },
};

interface AIBubbleMenuProps {
  editor: Editor;
}

type MenuView = 'trigger' | 'actions' | 'languages' | 'tones';

export function AIBubbleMenu({ editor }: AIBubbleMenuProps) {
  const { t } = useTranslation('notes');
  const { status, startStream, setSelectionRange } = useAIStore();
  const [menuView, setMenuView] = useState<MenuView>('trigger');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const changeMenuView = useCallback((view: MenuView) => {
    setMenuView(view);
    setSelectedIndex(0);
  }, []);

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
      changeMenuView('trigger');
    },
    [
      editor,
      getSelectedText,
      getFullContent,
      startStream,
      setSelectionRange,
      changeMenuView,
    ]
  );

  const handleActionClick = useCallback(
    (actionConfig: AIActionConfig) => {
      if (actionConfig.needsSubMenu === 'languages') {
        changeMenuView('languages');
        return;
      }
      if (actionConfig.needsSubMenu === 'tones') {
        changeMenuView('tones');
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
      className="z-[9999]"
      options={{
        placement: 'top',
        offset: 8,
      }}
    >
      <motion.div
        className={cn(
          'flex flex-col items-start',
          'rounded-xl border border-primary/25 bg-popover/95 backdrop-blur-xl',
          'shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]'
        )}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {/* Trigger button — gradient pill with shimmer */}
          {menuView === 'trigger' && (
            <motion.div key="trigger" {...crossfadeVariants}>
              <button
                type="button"
                className={cn(
                  'group relative flex items-center gap-2 overflow-hidden rounded-xl px-3.5 py-2 text-xs font-medium',
                  'bg-gradient-to-r from-primary/15 via-primary/8 to-primary/3',
                  'text-foreground transition-all duration-200',
                  'hover:from-primary/25 hover:via-primary/12 hover:to-primary/5',
                  'hover:shadow-[0_0_20px_-4px] hover:shadow-primary/40'
                )}
                onClick={() => changeMenuView('actions')}
              >
                {/* Shimmer overlay on hover */}
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 -translate-x-full',
                    'bg-gradient-to-r from-transparent via-white/10 to-transparent',
                    'transition-transform duration-500 ease-out',
                    'group-hover:translate-x-full'
                  )}
                />
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20">
                  <Sparkles className="h-3 w-3 text-primary" />
                </span>
                {t('ai.bubbleMenu.askAI')}
              </button>
            </motion.div>
          )}

          {/* Actions dropdown */}
          {menuView === 'actions' && (
            <motion.div key="actions" {...crossfadeVariants}>
              <CommandMenuContent
                width="md"
                className="border-0 shadow-none backdrop-blur-none"
              >
                <CommandMenuGroup>
                  {AI_BUBBLE_ACTIONS.map((actionConfig, index) => {
                    const Icon = actionConfig.icon;
                    return (
                      <CommandMenuItem
                        key={actionConfig.id}
                        icon={<Icon className="h-4 w-4 text-primary/70" />}
                        label={t(actionConfig.labelKey as never)}
                        hasSubMenu={!!actionConfig.needsSubMenu}
                        selected={index === selectedIndex}
                        onClick={() => handleActionClick(actionConfig)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      />
                    );
                  })}
                </CommandMenuGroup>
              </CommandMenuContent>
            </motion.div>
          )}

          {/* Languages sub-menu */}
          {menuView === 'languages' && (
            <SubMenuView
              motionKey="languages"
              backLabel={t('ai.bubbleMenu.back')}
              items={SUPPORTED_LANGUAGES}
              selectedIndex={selectedIndex}
              onBack={() => changeMenuView('actions')}
              onSelect={(value) => handleAction(AI_ACTION.TRANSLATE, value)}
              onIndexChange={setSelectedIndex}
            />
          )}

          {/* Tones sub-menu */}
          {menuView === 'tones' && (
            <SubMenuView
              motionKey="tones"
              backLabel={t('ai.bubbleMenu.back')}
              items={SUPPORTED_TONES}
              selectedIndex={selectedIndex}
              onBack={() => changeMenuView('actions')}
              onSelect={(value) =>
                handleAction(AI_ACTION.TONE, undefined, value)
              }
              onIndexChange={setSelectedIndex}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </BubbleMenu>
  );
}
