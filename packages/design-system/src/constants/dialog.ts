export const DIALOG_SIDE = {
  CENTER: 'center',
  RIGHT: 'right',
  FULL: 'full',
} as const;

export type DialogSide = (typeof DIALOG_SIDE)[keyof typeof DIALOG_SIDE];
