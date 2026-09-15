import { STUDY_FOCUS_ATTRIBUTE } from '@/components/artifacts/focus/study-focus-marker';
import { describe, expect, it } from 'vitest';

import { isStudyKeyEventIgnored } from './study-key-guard';

function keydown(target: EventTarget, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: ' ',
    bubbles: true,
    ...init,
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('isStudyKeyEventIgnored', () => {
  it('ignores keys typed into editable fields', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isStudyKeyEventIgnored(keydown(input), false)).toBe(true);
    expect(isStudyKeyEventIgnored(keydown(editable), false)).toBe(true);
  });

  it('ignores modified and repeated keys', () => {
    const body = document.body;
    expect(
      isStudyKeyEventIgnored(keydown(body, { metaKey: true }), false)
    ).toBe(true);
    expect(
      isStudyKeyEventIgnored(keydown(body, { shiftKey: true }), false)
    ).toBe(true);
    expect(isStudyKeyEventIgnored(keydown(body, { repeat: true }), false)).toBe(
      true
    );
    expect(isStudyKeyEventIgnored(keydown(body), false)).toBe(false);
  });

  it('ignores every dialog or menu layer when not inside a focus overlay', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    document.body.append(dialog);
    expect(isStudyKeyEventIgnored(keydown(button), false)).toBe(true);
    dialog.remove();
  });

  it('accepts keys inside the focus overlay itself but not inside a nested layer', () => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute(STUDY_FOCUS_ATTRIBUTE, '');
    const stage = document.createElement('div');
    const nested = document.createElement('div');
    nested.setAttribute('role', 'menu');
    const item = document.createElement('div');
    nested.append(item);
    overlay.append(stage, nested);
    document.body.append(overlay);
    expect(isStudyKeyEventIgnored(keydown(stage), true)).toBe(false);
    expect(isStudyKeyEventIgnored(keydown(item), true)).toBe(true);
    overlay.remove();
  });
});
