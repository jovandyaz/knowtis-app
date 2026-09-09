import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type RefCallback,
} from 'react';

import { cn } from '../utils/cn';

const BAR_COLOR_PROPERTY = '--muted-foreground';
const BAR_ACTIVE_COLOR_PROPERTY = '--primary';

// Canvas ignores an empty fillStyle, so an unresolved token must never reach it.
const FALLBACK_BAR_COLOR = 'oklch(0.560 0.008 290)';
const FALLBACK_BAR_ACTIVE_COLOR = 'oklch(0.47 0.22 295)';

const readThemeColor = (
  styles: CSSStyleDeclaration,
  property: string,
  fallback: string
) => {
  const value = styles.getPropertyValue(property).trim();
  return value.length > 0 ? value : fallback;
};

export interface AudioWaveformProps {
  analyserNode?: AnalyserNode | null;
  mockData?: Uint8Array;
  barCount?: number;
  barGap?: number;
  /** Overrides the `--muted-foreground` token the quiet bars are painted with. */
  barColor?: string;
  /** Overrides the `--primary` token the loud bars are painted with. */
  barActiveColor?: string;
  className?: string;
}

const AudioWaveform = forwardRef<HTMLCanvasElement, AudioWaveformProps>(
  (
    {
      analyserNode,
      mockData,
      barCount = 40,
      barGap = 2,
      barColor,
      barActiveColor,
      className,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationRef = useRef<number>(0);

    // The draw loop and the caller both need the node, so the ref fans out here.
    const attachCanvas = useCallback(
      (node: HTMLCanvasElement | null) => {
        canvasRef.current = node;

        if (typeof ref !== 'function') {
          if (ref) {
            ref.current = node;
          }
          return () => {
            canvasRef.current = null;
            if (ref) {
              ref.current = null;
            }
          };
        }

        const callerRef: RefCallback<HTMLCanvasElement> = ref;
        const detachCaller = callerRef(node);

        return () => {
          canvasRef.current = null;
          if (typeof detachCaller === 'function') {
            detachCaller();
            return;
          }
          // Returning a cleanup stops React from calling this ref back with
          // null, so a caller without one still needs that detach signal.
          callerRef(null);
        };
      },
      [ref]
    );

    const draw = useCallback(
      (ctx: CanvasRenderingContext2D, data: Uint8Array) => {
        const { width, height } = ctx.canvas;
        const dpr = window.devicePixelRatio || 1;

        const themeStyles = getComputedStyle(ctx.canvas);
        const inactiveFill =
          barColor ??
          readThemeColor(themeStyles, BAR_COLOR_PROPERTY, FALLBACK_BAR_COLOR);
        const activeFill =
          barActiveColor ??
          readThemeColor(
            themeStyles,
            BAR_ACTIVE_COLOR_PROPERTY,
            FALLBACK_BAR_ACTIVE_COLOR
          );

        ctx.clearRect(0, 0, width, height);

        const logicalWidth = width / dpr;
        const logicalHeight = height / dpr;

        const totalGap = barGap * (barCount - 1);
        const barWidth = (logicalWidth - totalGap) / barCount;
        const barRadius = barWidth / 2;

        const usableBins = Math.floor(data.length * 0.3);

        for (let i = 0; i < barCount; i++) {
          const dataIndex = Math.floor((i / barCount) * usableBins);
          const value = data[dataIndex] / 255;

          const minHeight = 4;
          const barHeight = Math.max(minHeight, value * logicalHeight);

          const x = i * (barWidth + barGap);
          const y = (logicalHeight - barHeight) / 2;

          ctx.fillStyle = value > 0.1 ? activeFill : inactiveFill;

          ctx.beginPath();
          ctx.roundRect(
            x * dpr,
            y * dpr,
            barWidth * dpr,
            barHeight * dpr,
            barRadius * dpr
          );
          ctx.fill();
        }
      },
      [barCount, barGap, barColor, barActiveColor]
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      const resizeCanvas = () => {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      };

      resizeCanvas();

      const resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(canvas);

      if (analyserNode) {
        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const animate = () => {
          analyserNode.getByteFrequencyData(dataArray);
          draw(ctx, dataArray);
          animationRef.current = requestAnimationFrame(animate);
        };

        animate();
      } else if (mockData) {
        draw(ctx, mockData);
      } else {
        const emptyData = new Uint8Array(barCount);
        draw(ctx, emptyData);
      }

      return () => {
        cancelAnimationFrame(animationRef.current);
        resizeObserver.disconnect();
      };
    }, [analyserNode, mockData, barCount, draw]);

    return (
      <canvas
        ref={attachCanvas}
        className={cn('h-16 w-full', className)}
        aria-hidden="true"
      />
    );
  }
);
AudioWaveform.displayName = 'AudioWaveform';

export { AudioWaveform };
