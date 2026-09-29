import { describe, expect, it } from 'vitest';

import { scanForToolMarkup, type ToolMarkupScan } from './tool-markup-guard';

function scanAll(deltas: readonly string[]): {
  emitted: string;
  last: ToolMarkupScan;
} {
  let held = '';
  let emitted = '';
  let last: ToolMarkupScan = { emit: '', held: '', leaked: false };
  for (const delta of deltas) {
    last = scanForToolMarkup(held, delta);
    emitted += last.emit;
    held = last.held;
    if (last.leaked) {
      break;
    }
  }
  return { emitted, last };
}

describe('scanForToolMarkup', () => {
  it('passes plain text through without holding anything back', () => {
    expect(scanForToolMarkup('', 'Resumen parcial.')).toEqual({
      emit: 'Resumen parcial.',
      held: '',
      leaked: false,
    });
  });

  it('trips on a DSML tag and keeps only the text before its bracket', () => {
    expect(
      scanForToolMarkup(
        '',
        'Resumen parcial.\n\n<｜DSML｜function_calls>\n<｜DSML｜invoke name="getNote">'
      )
    ).toEqual({ emit: 'Resumen parcial.\n\n', held: '', leaked: true });
  });

  it('trips on the spaced DSML variant', () => {
    expect(scanForToolMarkup('', 'Hecho. <｜DSML｜ calls>')).toEqual({
      emit: 'Hecho. ',
      held: '',
      leaked: true,
    });
  });

  it('trips on a bare DSML marker with no tag around it', () => {
    expect(scanForToolMarkup('', 'Hecho. ｜DSML｜invoke')).toEqual({
      emit: 'Hecho. ',
      held: '',
      leaked: true,
    });
  });

  it('trips on a closing DSML tag without letting its bracket through', () => {
    expect(scanForToolMarkup('', 'Hecho. </｜DSML｜function_calls>')).toEqual({
      emit: 'Hecho. ',
      held: '',
      leaked: true,
    });
  });

  it('catches a marker split across deltas and emits only the text before it', () => {
    expect(
      scanAll(['Resumen <', '｜DS', 'ML｜function_calls>', ' más texto'])
    ).toEqual({
      emitted: 'Resumen ',
      last: { emit: '', held: '', leaked: true },
    });
  });

  it('holds back a tail that could open a marker', () => {
    expect(scanForToolMarkup('', 'Resumen <｜DS')).toEqual({
      emit: 'Resumen ',
      held: '<｜DS',
      leaked: false,
    });
  });

  it('releases a held tail once the next delta shows it opens no marker', () => {
    expect(scanAll(['a < b <', '｜ c'])).toEqual({
      emitted: 'a < b <｜ c',
      last: { emit: '<｜ c', held: '', leaked: false },
    });
  });

  it('leaves a held tail for the caller to flush when the text ends on it', () => {
    expect(scanAll(['Total: 3 <'])).toEqual({
      emitted: 'Total: 3 ',
      last: { emit: 'Total: 3 ', held: '<', leaked: false },
    });
  });
});
