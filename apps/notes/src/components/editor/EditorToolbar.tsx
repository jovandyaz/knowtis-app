import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  TOOLBAR_TOOLS,
  type ToolbarToolConfig,
} from '@/components/editor/editor.config';
import type { Editor } from '@tiptap/react';
import { Mic } from 'lucide-react';
import { motion } from 'motion/react';

import { Button, cn } from '@knowtis/design-system';

import type { SaveStatus } from './SaveStatusIndicator';
import { SaveStatusIndicator } from './SaveStatusIndicator';

interface EditorToolbarProps {
  editor: Editor | null;
  saveStatus?: SaveStatus | undefined;
  onVoiceNote?: (() => void) | undefined;
}

interface ToolbarButtonProps {
  editor: Editor;
  tool: ToolbarToolConfig;
}

function ToolbarButton({ editor, tool }: ToolbarButtonProps) {
  const Icon = tool.icon;
  const isActive = tool.isActive(editor);
  const isDisabled = tool.disabled?.(editor) ?? false;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 w-8 rounded-full p-0 transition-all',
        isActive
          ? 'bg-foreground text-background hover:bg-foreground/90'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        tool.hideOnMobile && 'max-md:hidden'
      )}
      onClick={() => tool.action(editor)}
      disabled={isDisabled}
      title={tool.label}
      aria-label={tool.label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function ToolbarSeparator() {
  return <div className="mx-1 h-4 w-px bg-border max-md:hidden" />;
}

export const EditorToolbar = memo(function EditorToolbar({
  editor,
  saveStatus,
  onVoiceNote,
}: EditorToolbarProps) {
  const { t } = useTranslation('common');
  const { t: tNotes } = useTranslation('notes');

  if (!editor) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'z-10 mx-auto w-fit',
        'sticky top-4 mb-4',
        'max-md:fixed max-md:bottom-3 max-md:left-0 max-md:right-0 max-md:top-auto max-md:mb-0 max-md:w-full max-md:px-4 max-md:pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1 rounded-full border border-border/50 bg-background/80 p-1 shadow-lg shadow-black/5 backdrop-blur-md dark:bg-muted/30',
          'max-md:mx-auto max-md:w-fit max-md:rounded-2xl'
        )}
      >
        {TOOLBAR_TOOLS.map((item, index) => {
          if ('type' in item && item.type === 'separator') {
            return <ToolbarSeparator key={`sep-${index}`} />;
          }

          const tool = item as ToolbarToolConfig;
          return <ToolbarButton key={tool.label} editor={editor} tool={tool} />;
        })}
        {onVoiceNote && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full p-0 text-(--primary) hover:bg-(--primary)/10 hover:text-(--primary) md:hidden"
            onClick={onVoiceNote}
            aria-label={tNotes('ai.slash.voiceNote')}
          >
            <Mic className="h-4 w-4" />
          </Button>
        )}
        {saveStatus && (
          <SaveStatusIndicator
            status={saveStatus}
            label={
              saveStatus === 'saving' ? t('states.saving') : t('states.saved')
            }
            className="hidden max-md:flex ml-1 text-xs text-(--muted-foreground)"
          />
        )}
      </div>
    </motion.div>
  );
});
