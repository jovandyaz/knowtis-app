import type { DOMAttributes, MouseEvent } from 'react';

function blockLinkNavigation(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('a')) {
    event.preventDefault();
  }
}

export const BLOCK_LINK_NAVIGATION: Pick<
  DOMAttributes<Element>,
  'onClickCapture' | 'onAuxClickCapture'
> = {
  onClickCapture: blockLinkNavigation,
  onAuxClickCapture: blockLinkNavigation,
};
