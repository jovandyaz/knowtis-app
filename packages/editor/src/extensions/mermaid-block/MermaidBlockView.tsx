import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import {
  AlertTriangle,
  Code,
  Expand,
  Eye,
  SplitSquareHorizontal,
} from 'lucide-react';
import type mermaidType from 'mermaid';

import { Button, cn } from '@knowtis/design-system';
import {
  MERMAID_VIEW_MODE,
  type MermaidViewMode,
} from '@knowtis/editor-schema';

import { MermaidDiagramViewer } from './MermaidDiagramViewer';
import { useDocumentDarkTheme } from './useDocumentDarkTheme';

const DEFAULT_MERMAID_CODE = 'graph TD\n  A[Start] --> B[End]';
const RENDER_DEBOUNCE_MS = 300;

const MERMAID_THEME = {
  LIGHT: 'neutral',
  DARK: 'dark',
} as const;

type MermaidTheme = (typeof MERMAID_THEME)[keyof typeof MERMAID_THEME];

let mermaidInstance: typeof mermaidType | null = null;
let appliedTheme: MermaidTheme | null = null;

async function getMermaid(theme: MermaidTheme) {
  if (!mermaidInstance) {
    const { default: mermaid } = await import('mermaid');
    mermaidInstance = mermaid;
  }
  if (appliedTheme !== theme) {
    // the rendered svg goes straight into innerHTML: strict is what makes
    // mermaid DOMPurify its own output before we inject it
    mermaidInstance.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
    });
    appliedTheme = theme;
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
  const code: string = node.attrs['code'];
  const viewMode: MermaidViewMode = node.attrs['viewMode'];
  const effectiveViewMode = editor.isEditable
    ? viewMode
    : MERMAID_VIEW_MODE.PREVIEW;

  const isDark = useDocumentDarkTheme();
  const theme: MermaidTheme = isDark ? MERMAID_THEME.DARK : MERMAID_THEME.LIGHT;

  const [svg, setSvg] = useState<string>('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [error, setError] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const renderSeqRef = useRef(0);
  const reactId = useId();
  const renderId = `mermaid-${reactId.replace(/:/g, '')}`;

  const invalidSyntaxFallback = t('editor.mermaid.invalidSyntax');

  const renderDiagram = useCallback(
    async (source: string) => {
      if (!source.trim()) {
        setSvg('');
        setError('');
        // a collaborator can empty the block while the viewer is open: without
        // this it would pop back open on its own once they type again
        setViewerOpen(false);
        return;
      }

      // mermaid.render deletes any DOM element with the target id — a reused id wipes the mounted svg
      const seq = ++renderSeqRef.current;
      try {
        const mermaid = await getMermaid(theme);
        const { svg: rendered } = await mermaid.render(
          `${renderId}-${seq}`,
          source
        );
        if (seq !== renderSeqRef.current) {
          return;
        }
        setSvg(rendered);
        setError('');
      } catch (err) {
        if (seq !== renderSeqRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : invalidSyntaxFallback);
      }
    },
    [renderId, invalidSyntaxFallback, theme]
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
      <div className="flex items-center justify-between gap-2 bg-muted/30 px-3 py-1.5 border-b border-border/50">
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          {t('editor.mermaid.label')}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {editor.isEditable &&
            VIEW_MODE_BUTTONS.map(({ mode, icon: Icon, labelKey }) => {
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
                  <Icon className="h-3 w-3 sm:mr-1" />
                  <span className="sr-only sm:not-sr-only">{label}</span>
                </Button>
              );
            })}
          {showPreview && svg && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => setViewerOpen(true)}
              aria-label={t('editor.mermaid.expand')}
            >
              <Expand className="h-3 w-3 sm:mr-1" />
              <span className="sr-only sm:not-sr-only">
                {t('editor.mermaid.expand')}
              </span>
            </Button>
          )}
        </div>
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
        {/* mermaid scopes its <style> and url(#marker) refs by the svg id, so a
            second live copy while the viewer is open would collide with it */}
        {showPreview && !viewerOpen && (
          <div className="mermaid-preview-area p-3 flex items-center justify-center min-h-[120px] bg-background">
            {error && !svg ? (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{error}</span>
              </div>
            ) : svg ? (
              <div
                className="max-w-full cursor-zoom-in overflow-auto [&_svg]:max-w-full [&_svg]:h-auto"
                onDoubleClick={() => setViewerOpen(true)}
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

      {svg && viewerOpen && (
        <MermaidDiagramViewer open onOpenChange={setViewerOpen} svg={svg} />
      )}
    </NodeViewWrapper>
  );
}
