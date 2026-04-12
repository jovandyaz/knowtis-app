import { useCallback, useEffect, useRef } from 'react';

import { cn } from '../utils';

export interface AudioWaveformProps {
  analyserNode?: AnalyserNode | null;
  mockData?: Uint8Array;
  barCount?: number;
  barGap?: number;
  barColor?: string;
  barActiveColor?: string;
  className?: string;
}

export function AudioWaveform({
  analyserNode,
  mockData,
  barCount = 40,
  barGap = 2,
  barColor = 'rgba(148, 163, 184, 0.3)',
  barActiveColor = 'rgba(59, 130, 246, 0.8)',
  className,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, data: Uint8Array) => {
      const { width, height } = ctx.canvas;
      const dpr = window.devicePixelRatio || 1;

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

        ctx.fillStyle = value > 0.1 ? barActiveColor : barColor;

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
      ref={canvasRef}
      className={cn('h-16 w-full', className)}
      aria-hidden="true"
    />
  );
}

AudioWaveform.displayName = 'AudioWaveform';
