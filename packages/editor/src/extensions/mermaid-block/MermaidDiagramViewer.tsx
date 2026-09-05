import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { LucideIcon } from 'lucide-react';
import { Scan, ZoomIn, ZoomOut } from 'lucide-react';

import {
  Button,
  Dialog,
  DIALOG_SIDE,
  DialogContent,
  DialogTitle,
} from '@knowtis/design-system';

import { naturalSvgSize } from './naturalSvgSize';
import { useDragZoomGestures } from './useDragZoomGestures';
import { usePanZoom, type Size } from './usePanZoom';

const PERCENT = 100;

interface MermaidDiagramViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  svg: string;
}

interface ZoomControlProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

function ZoomControl({ icon: Icon, label, onClick }: ZoomControlProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 rounded-full p-0"
      onClick={onClick}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

export function MermaidDiagramViewer({
  open,
  onOpenChange,
  svg,
}: MermaidDiagramViewerProps) {
  const { t } = useTranslation('notes');
  // the dialog portal mounts its subtree a render late, so the nodes arrive as
  // state: effects keyed on refs alone would run once against null and stop
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [drawnSize, setDrawnSize] = useState<Size | null>(null);

  const { transform, zoomIn, zoomOut, zoomAtPoint, panBy, fit } = usePanZoom();
  const gestures = useDragZoomGestures(surface, { panBy, zoomAtPoint });
  const viewport = useRef<Size>({ width: 0, height: 0 });
  const fittedDiagram = useRef<string | null>(null);

  useEffect(() => {
    const diagram = layer?.querySelector('svg');
    if (!surface || !diagram) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      viewport.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      // mermaid ships the svg at width:100%, so it only fills a box something
      // else sizes — React owns this subtree, so the box is the layer, never
      // the svg's own style
      const size = naturalSvgSize(diagram);
      setDrawnSize(size);
      // a later resize must not throw away the zoom the reader chose
      if (fittedDiagram.current !== svg) {
        fittedDiagram.current = svg;
        fit(size, viewport.current);
      }
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [surface, layer, svg, fit]);

  const fitToViewport = useCallback(() => {
    if (drawnSize) {
      fit(drawnSize, viewport.current);
    }
  }, [drawnSize, fit]);

  const zoomPercent = Math.round(transform.scale * PERCENT);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        side={DIALOG_SIDE.FULL}
        className="bg-(--background) [&>button]:top-3.5"
      >
        <div className="flex items-center border-b border-border/50 px-4 py-3 pr-14">
          <DialogTitle className="text-sm font-medium text-muted-foreground">
            {t('editor.mermaid.viewerTitle')}
          </DialogTitle>
        </div>

        <div
          ref={setSurface}
          {...gestures}
          className="relative touch-none cursor-grab overflow-hidden active:cursor-grabbing"
        >
          <div
            ref={setLayer}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: '0 0',
              width: drawnSize ? `${drawnSize.width}px` : undefined,
              height: drawnSize ? `${drawnSize.height}px` : undefined,
            }}
            className="w-fit select-none [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <div
              onPointerDown={(event) => event.stopPropagation()}
              className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border/50 bg-background/80 p-1 shadow-lg shadow-black/5 backdrop-blur-md dark:bg-muted/30"
            >
              <ZoomControl
                icon={ZoomOut}
                label={t('editor.mermaid.zoomOut')}
                onClick={zoomOut}
              />
              <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
                {zoomPercent}%
              </span>
              <ZoomControl
                icon={ZoomIn}
                label={t('editor.mermaid.zoomIn')}
                onClick={zoomIn}
              />
              <ZoomControl
                icon={Scan}
                label={t('editor.mermaid.fitToScreen')}
                onClick={fitToViewport}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
