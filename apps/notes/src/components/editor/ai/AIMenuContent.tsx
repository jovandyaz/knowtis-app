import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { Editor } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';

import {
  CommandMenuBack,
  CommandMenuGroup,
  CommandMenuItem,
} from '@knowtis/design-system';
import type { AILanguage, AITone } from '@knowtis/shared-types';

import {
  AI_MENU_CONTEXT,
  executeAIAction,
  getAIActionsForContext,
  SUPPORTED_LANGUAGES,
  SUPPORTED_TONES,
  type AIMenuActionConfig,
  type AIMenuContext,
} from './ai-actions.config';

type MenuView = 'root' | 'languages' | 'tones';

interface MenuRow {
  key: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  hasSubMenu?: boolean;
  onSelect: () => void;
}

interface MenuViewModel {
  rows: MenuRow[];
  groupLabel?: string;
  canGoBack: boolean;
}

interface AIMenuContentProps {
  editor: Editor;
  context: AIMenuContext;
  onClose: () => void;
}

export function AIMenuContent({
  editor,
  context,
  onClose,
}: AIMenuContentProps) {
  const { t } = useTranslation('notes');
  const [view, setView] = useState<MenuView>('root');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const rootActions = useMemo(() => getAIActionsForContext(context), [context]);

  const goToView = (next: MenuView) => {
    setView(next);
    setSelectedIndex(0);
  };

  const run = (
    config: AIMenuActionConfig,
    target: { targetLanguage?: AILanguage; targetTone?: AITone } = {}
  ) => {
    executeAIAction({ editor, config, context, ...target });
    onClose();
  };

  const tr = (key: string) => t(key as never) as string;

  const { rows, groupLabel, canGoBack } = buildViewModel({
    view,
    context,
    rootActions,
    t: tr,
    goToView,
    run,
  });

  useEffect(() => {
    itemRefs.current[selectedIndex]?.focus();
  }, [selectedIndex, view]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % rows.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + rows.length) % rows.length);
        break;
      case 'Enter':
        event.preventDefault();
        rows[selectedIndex]?.onSelect();
        break;
      case 'ArrowLeft':
      case 'Backspace':
        if (canGoBack) {
          event.preventDefault();
          goToView('root');
        }
        break;
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="outline-none">
      <CommandMenuGroup {...(groupLabel ? { label: groupLabel } : {})}>
        {canGoBack && (
          <CommandMenuBack
            label={tr('ai.menu.back')}
            onClick={() => goToView('root')}
          />
        )}
        {rows.map((row, index) => {
          const Icon = row.icon;
          return (
            <CommandMenuItem
              key={row.key}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              {...(Icon
                ? { icon: <Icon className="h-4 w-4 text-primary/70" /> }
                : {})}
              label={row.label}
              {...(row.description ? { description: row.description } : {})}
              hasSubMenu={row.hasSubMenu ?? false}
              selected={index === selectedIndex}
              onClick={row.onSelect}
              onFocus={() => setSelectedIndex(index)}
              onMouseEnter={() => setSelectedIndex(index)}
            />
          );
        })}
      </CommandMenuGroup>
    </div>
  );
}

interface BuildViewModelArgs {
  view: MenuView;
  context: AIMenuContext;
  rootActions: AIMenuActionConfig[];
  t: (key: string) => string;
  goToView: (next: MenuView) => void;
  run: (
    config: AIMenuActionConfig,
    target?: { targetLanguage?: AILanguage; targetTone?: AITone }
  ) => void;
}

function buildViewModel({
  view,
  context,
  rootActions,
  t,
  goToView,
  run,
}: BuildViewModelArgs): MenuViewModel {
  if (view === 'languages' || view === 'tones') {
    const parent = rootActions.find((action) => action.submenu === view);
    const options =
      view === 'languages' ? SUPPORTED_LANGUAGES : SUPPORTED_TONES;
    const toTarget = (value: string) =>
      view === 'languages'
        ? { targetLanguage: value as AILanguage }
        : { targetTone: value as AITone };

    return {
      canGoBack: true,
      rows: options.map((option) => ({
        key: option.value,
        label: t(option.labelKey),
        onSelect: () => {
          if (parent) {
            run(parent, toTarget(option.value));
          }
        },
      })),
    };
  }

  return {
    canGoBack: false,
    groupLabel:
      context === AI_MENU_CONTEXT.SELECTION
        ? t('ai.groups.transform')
        : t('ai.groups.generate'),
    rows: rootActions.map((config) => ({
      key: config.id,
      label: t(config.labelKey),
      icon: config.icon,
      hasSubMenu: !!config.submenu,
      ...(config.descriptionKey
        ? { description: t(config.descriptionKey) }
        : {}),
      onSelect: () => (config.submenu ? goToView(config.submenu) : run(config)),
    })),
  };
}
