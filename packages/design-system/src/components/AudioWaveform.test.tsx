import { createRef } from 'react';

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioWaveform } from './AudioWaveform';

const THEME_BAR_COLOR = 'oklch(0.6 0.1 200)';
const THEME_BAR_ACTIVE_COLOR = 'oklch(0.3 0.2 20)';

// jsdom resolves no inherited custom properties, so the theme has to be declared
// on the canvas itself for `getComputedStyle` to see it.
const themeStyleRule = `canvas { --muted-foreground: ${THEME_BAR_COLOR}; --primary: ${THEME_BAR_ACTIVE_COLOR}; }`;

type RecordingContext = Pick<
  CanvasRenderingContext2D,
  'canvas' | 'fillStyle' | 'clearRect' | 'beginPath' | 'roundRect' | 'fill'
>;

let paintedFills: Array<string | CanvasGradient | CanvasPattern>;

function createRecordingContext(canvas: HTMLCanvasElement) {
  const state = { fillStyle: '' as string | CanvasGradient | CanvasPattern };

  const context: RecordingContext = {
    canvas,
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      state.fillStyle = value;
    },
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(() => {
      paintedFills.push(state.fillStyle);
    }),
  };

  return context as CanvasRenderingContext2D;
}

beforeEach(() => {
  paintedFills = [];
  // jsdom ships no canvas backend, so the drawing surface is a recording stub.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      return createRecordingContext(this);
    }
  );
  vi.spyOn(
    HTMLCanvasElement.prototype,
    'getBoundingClientRect'
  ).mockReturnValue(new DOMRect(0, 0, 320, 64));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AudioWaveform', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLCanvasElement>();
    const { container } = render(<AudioWaveform ref={ref} />);
    expect(ref.current).toBe(container.querySelector('canvas'));
  });

  it('paints the bars with the theme tokens instead of the fallbacks', () => {
    const mockData = new Uint8Array(128);
    mockData[0] = 255;

    render(
      <>
        <style>{themeStyleRule}</style>
        <AudioWaveform mockData={mockData} />
      </>
    );

    expect(new Set(paintedFills)).toEqual(
      new Set([THEME_BAR_ACTIVE_COLOR, THEME_BAR_COLOR])
    );
  });

  it('honours an explicit colour override over the theme tokens', () => {
    const override = 'oklch(0.9 0.05 120)';

    render(
      <>
        <style>{themeStyleRule}</style>
        <AudioWaveform barColor={override} barActiveColor={override} />
      </>
    );

    expect(new Set(paintedFills)).toEqual(new Set([override]));
  });
});
