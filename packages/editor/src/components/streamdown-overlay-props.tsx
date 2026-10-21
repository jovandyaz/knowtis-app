import type { StreamdownProps } from 'streamdown';

import { LinkConfirmationDialog } from './LinkConfirmationDialog';

export const STREAMDOWN_OVERLAY_PROPS: Pick<
  StreamdownProps,
  'linkSafety' | 'controls'
> = {
  linkSafety: {
    enabled: true,
    renderModal: (props) => <LinkConfirmationDialog {...props} />,
  },
  controls: { table: false },
};
