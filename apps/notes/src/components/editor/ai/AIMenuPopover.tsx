import { useTranslation } from 'react-i18next';

import { useAIMenuStore } from '@/stores/ai-menu.store';
import type { Editor } from '@tiptap/react';
import { Sparkles } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@knowtis/design-system';

import { AI_MENU_CONTEXT, type AIMenuContext } from './ai-actions.config';
import { AIMenuContent } from './AIMenuContent';

interface AIMenuPopoverProps {
  editor: Editor;
}

export function AIMenuPopover({ editor }: AIMenuPopoverProps) {
  const { t } = useTranslation(['notes', 'common']);
  const isOpen = useAIMenuStore((state) => state.isOpen);
  const close = useAIMenuStore((state) => state.close);

  if (!isOpen) {
    return null;
  }

  const { from, to } = editor.state.selection;
  const context: AIMenuContext =
    from === to ? AI_MENU_CONTEXT.CURSOR : AI_MENU_CONTEXT.SELECTION;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <DialogContent
        className="gap-2 p-3 md:max-w-md"
        closeLabel={t('common:labels.closeDialog')}
      >
        <DialogTitle className="flex items-center gap-2 px-2.5 pt-0.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('ai.menu.title')}
        </DialogTitle>
        <AIMenuContent editor={editor} context={context} onClose={close} />
      </DialogContent>
    </Dialog>
  );
}
