import { useCallback, useEffect, useRef, useState } from 'react';

import type { Editor } from '@tiptap/react';
import { Link, Unlink } from 'lucide-react';

import {
  Button,
  cn,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

interface LinkPopoverProps {
  editor: Editor;
  shortcut?: string | undefined;
}

export function LinkPopover({ editor, shortcut }: LinkPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isActive = editor.isActive('link');

  const openPopover = useCallback(() => {
    const existingHref = editor.getAttributes('link')['href'];
    setUrl(typeof existingHref === 'string' ? existingHref : '');
    setIsOpen(true);
  }, [editor]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
    setUrl('');
    editor.commands.focus();
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      const href = url.match(/^https?:\/\//) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    closePopover();
  }, [url, editor, closePopover]);

  const removeLink = useCallback(() => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    closePopover();
  }, [editor, closePopover]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        closePopover();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closePopover]);

  const tooltipLabel = shortcut ? `Link (${shortcut})` : 'Link';

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 rounded-full p-0 transition-all',
              isActive
                ? 'bg-foreground text-background hover:bg-foreground/90'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            onClick={() => openPopover()}
            aria-label="Link"
          >
            {isActive ? (
              <Unlink className="h-4 w-4" />
            ) : (
              <Link className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>

      {isOpen && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--card) p-1.5 shadow-lg">
            <Input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  applyLink();
                }
                if (e.key === 'Escape') {
                  closePopover();
                }
              }}
              placeholder="https://..."
              className="h-7 w-48 text-sm"
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={applyLink}>
              OK
            </Button>
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={removeLink}
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
