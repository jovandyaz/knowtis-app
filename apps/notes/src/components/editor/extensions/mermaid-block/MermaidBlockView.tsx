import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { AlertTriangle, Code, Eye, SplitSquareHorizontal } from 'lucide-react';
import type mermaidType from 'mermaid';

import { Button, cn } from '@knowtis/design-system';
import {
  MERMAID_VIEW_MODE,
  type MermaidViewMode,
} from '@knowtis/editor-schema';

const DEFAULT_MERMAID_CODE = 'graph TD\n  A[Start] --> B[End]';
const RENDER_DEBOUNCE_MS = 300;

let mermaidInstance: typeof mermaidType | null = null;

async function getMermaid() {
  if (!mermaidInstance) {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    mermaidInstance = mermaid;
  }
  return mermaidInstance;
}

const VIEW_MODE_BUTTONS = [
  {
    mode: MERMAID_VIEW_MODE.CODE,
    icon: Code,
    labelKey: 'editor.mermaid.modeCode',
  },
  {
    mode: MERMAID_VIEW_MODE.SPLIT,
    icon: SplitSquareHorizontal,
    labelKey: 'editor.mermaid.modeSplit',
  },
  {
    mode: MERMAID_VIEW_MODE.PREVIEW,
    icon: Eye,
    labelKey: 'editor.mermaid.modePreview',
  },
] as const;

export function MermaidBlockView({
  node,
  updateAttributes,
  selected,
  editor,
}: NodeViewProps) {
  const { t } = useTranslation('notes');
  const code: string = node.attrs.code;
  const viewMode: MermaidViewMode = node.attrs.viewMode;
  const effectiveViewMode = editor.isEditable
    ? viewMode
    : MERMAID_VIEW_MODE.PREVIEW;

  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reactId = useId();
  const renderId = `mermaid-${reactId.replace(/:/g, '')}`;

  const invalidSyntaxFallback = t('editor.mermaid.invalidSyntax');

  const renderDiagram = useCallback(
    async (source: string) => {
      if (!source.trim()) {
        setSvg('');
        setError('');
        return;
      }

      try {
        const mermaid = await getMermaid();
        const { svg: rendered } = await mermaid.render(renderId, source);
        setSvg(rendered);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : invalidSyntaxFallback);
      }
    },
    [renderId, invalidSyntaxFallback]
  );

  useEffect(() => {
    if (effectiveViewMode === MERMAID_VIEW_MODE.CODE) {
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      renderDiagram(code);
    }, RENDER_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [code, effectiveViewMode, renderDiagram]);

  const showCode = effectiveViewMode !== MERMAID_VIEW_MODE.PREVIEW;
  const showPreview = effectiveViewMode !== MERMAID_VIEW_MODE.CODE;

  return (
    <NodeViewWrapper
      className={cn(
        'mermaid-block my-4 rounded-lg border overflow-hidden',
        selected ? 'border-primary/50 shadow-md' : 'border-border/50'
      )}
    >
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground">
          {t('editor.mermaid.label')}
        </span>
        {editor.isEditable && (
          <div className="flex gap-0.5">
            {VIEW_MODE_BUTTONS.map(({ mode, icon: Icon, labelKey }) => {
              const label = t(labelKey);
              return (
                <Button
                  key={mode}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-6 px-2 text-xs',
                    viewMode === mode
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-muted-foreground'
                  )}
                  onClick={() => updateAttributes({ viewMode: mode })}
                  aria-label={label}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className={cn(
          showCode &&
            showPreview &&
            'grid grid-cols-2 divide-x divide-border/50'
        )}
      >
        {showCode && (
          <div className="bg-muted/60 opacity-50 transition-opacity focus-within:opacity-100">
            <textarea
              className="w-full bg-transparent p-3 font-mono text-sm resize-none outline-none min-h-[120px] text-foreground"
              value={code}
              onChange={(e) => updateAttributes({ code: e.target.value })}
              readOnly={!editor.isEditable}
              spellCheck={false}
              placeholder={DEFAULT_MERMAID_CODE}
            />
          </div>
        )}
        {showPreview && (
          <div className="mermaid-preview-area p-3 flex items-center justify-center min-h-[120px] bg-background">
            {error && !svg ? (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{error}</span>
              </div>
            ) : svg ? (
              // Safe: mermaid.render() runs with default securityLevel: 'strict' which escapes HTML in labels and strips scripts
              <div
                className="max-w-full overflow-auto [&_svg]:max-w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {t('editor.mermaid.previewPlaceholder')}
              </span>
            )}
          </div>
        )}
      </div>

      {error && svg && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-xs text-destructive border-t border-border/50">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </NodeViewWrapper>
  );
}
