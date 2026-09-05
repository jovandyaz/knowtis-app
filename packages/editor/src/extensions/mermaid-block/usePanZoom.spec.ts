import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MAX_SCALE, MIN_SCALE, usePanZoom, ZOOM_STEP } from './usePanZoom';

const VIEWPORT = { width: 1000, height: 600 };
const WIDE_CONTENT = { width: 4000, height: 400 };
const SMALL_CONTENT = { width: 200, height: 100 };
const ORIGIN = { x: 0, y: 0 };

describe('usePanZoom', () => {
  it('starts at natural scale with no offset', () => {
    const { result } = renderHook(() => usePanZoom());

    expect(result.current.transform).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('zooms by the given factor', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => result.current.zoomAtPoint(ZOOM_STEP, ORIGIN));

    expect(result.current.transform.scale).toBeCloseTo(ZOOM_STEP);
  });

  it('never zooms past the maximum scale', () => {
    const { result } = renderHook(() => usePanZoom());

    for (let i = 0; i < 50; i++) {
      act(() => result.current.zoomAtPoint(ZOOM_STEP, ORIGIN));
    }

    expect(result.current.transform.scale).toBe(MAX_SCALE);
  });

  it('never zooms below the minimum scale', () => {
    const { result } = renderHook(() => usePanZoom());

    for (let i = 0; i < 50; i++) {
      act(() => result.current.zoomAtPoint(1 / ZOOM_STEP, ORIGIN));
    }

    expect(result.current.transform.scale).toBe(MIN_SCALE);
  });

  it('keeps the anchored point under the pointer while zooming', () => {
    const { result } = renderHook(() => usePanZoom());
    const anchor = { x: 300, y: 200 };

    act(() => result.current.zoomAtPoint(2, anchor));

    const { scale, x, y } = result.current.transform;
    // the world point under the anchor before the zoom must still be under it
    expect((anchor.x - x) / scale).toBeCloseTo(anchor.x);
    expect((anchor.y - y) / scale).toBeCloseTo(anchor.y);
  });

  it('pans by the dragged delta', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => result.current.panBy({ x: -120, y: 40 }));

    expect(result.current.transform).toMatchObject({ x: -120, y: 40 });
  });

  it('fits wide content to the viewport width and centres it', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => result.current.fit(WIDE_CONTENT, VIEWPORT));

    const { scale, x, y } = result.current.transform;
    expect(scale).toBeCloseTo(VIEWPORT.width / WIDE_CONTENT.width);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo((VIEWPORT.height - WIDE_CONTENT.height * scale) / 2);
  });

  it('does not blow small content past its natural size when fitting', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => result.current.fit(SMALL_CONTENT, VIEWPORT));

    expect(result.current.transform.scale).toBe(1);
  });

  it('stays usable when asked to fit before anything has been laid out', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() =>
      result.current.fit({ width: 0, height: 0 }, { width: 0, height: 0 })
    );

    expect(result.current.transform).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('keeps the natural scale when the viewport has not been measured', () => {
    const { result } = renderHook(() => usePanZoom());

    act(() => result.current.fit(WIDE_CONTENT, { width: 0, height: 0 }));

    expect(result.current.transform).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('discards zoom and pan when asked to fit again', () => {
    const { result } = renderHook(() => usePanZoom());
    act(() => result.current.fit(WIDE_CONTENT, VIEWPORT));
    const fitted = result.current.transform;

    act(() => result.current.zoomAtPoint(ZOOM_STEP, ORIGIN));
    act(() => result.current.panBy({ x: 200, y: 200 }));
    act(() => result.current.fit(WIDE_CONTENT, VIEWPORT));

    expect(result.current.transform).toEqual(fitted);
  });
});
