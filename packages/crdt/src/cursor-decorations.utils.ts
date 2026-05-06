import { Decoration } from '@tiptap/pm/view';

import { clampPosition } from './collaboration';
import type { RemoteUserState, UserInfo } from './cursor-decorations.types';

/**
 * Creates a DOM element for displaying a user's caret (cursor position)
 * @param user - User information including name and color
 * @returns HTMLElement representing the caret with user label
 */
export function createCaretElement(user: UserInfo): HTMLElement {
  const caret = document.createElement('span');
  caret.className = 'collaboration-carets__caret';
  caret.style.borderColor = user.color;

  const label = document.createElement('div');
  label.className = 'collaboration-carets__label';
  label.style.backgroundColor = user.color;
  label.textContent = user.name;

  caret.appendChild(label);
  return caret;
}

/**
 * Creates a ProseMirror decoration for a user's text selection
 * @param from - Start position of selection
 * @param to - End position of selection
 * @param user - User information including color
 * @returns Decoration with semi-transparent background color
 */
export function createSelectionDecoration(
  from: number,
  to: number,
  user: UserInfo
): Decoration {
  return Decoration.inline(from, to, {
    class: 'collaboration-carets__selection',
    style: `background-color: ${user.color}33;`,
  });
}

/**
 * Creates all decorations (caret and selection) for a remote user
 * @param userState - Remote user's state
 * @param docSize - Current document size for position clamping
 * @returns Array of ProseMirror decorations
 */
export function createUserDecorations(
  userState: RemoteUserState,
  docSize: number
): Decoration[] {
  const decorations: Decoration[] = [];
  const { clientId, user, cursor } = userState;

  const anchorPos = clampPosition(cursor.anchor, docSize);
  const headPos = clampPosition(cursor.head, docSize);

  decorations.push(
    Decoration.widget(headPos, () => createCaretElement(user), {
      side: 1,
      key: `cursor-${clientId}`,
    })
  );

  if (anchorPos !== headPos) {
    const from = Math.min(anchorPos, headPos);
    const to = Math.max(anchorPos, headPos);
    decorations.push(createSelectionDecoration(from, to, user));
  }

  return decorations;
}
