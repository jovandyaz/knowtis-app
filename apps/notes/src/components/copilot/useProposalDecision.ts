import { useState, type KeyboardEvent } from 'react';

export interface ProposalDecision {
  rejecting: boolean;
  reason: string;
  setReason: (reason: string) => void;
  approve: () => void;
  startReject: () => void;
  cancelReject: () => void;
  confirmReject: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export function useProposalDecision(
  onApprove: () => void,
  onReject: (reason?: string) => void
): ProposalDecision {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const approve = () => onApprove();
  const startReject = () => setRejecting(true);
  const cancelReject = () => {
    setRejecting(false);
    setReason('');
  };
  const confirmReject = () => onReject(reason.trim() || undefined);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (rejecting) {
        confirmReject();
      } else {
        approve();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      // Inside the mobile dock dialog, Radix would also dismiss the layer.
      event.stopPropagation();
      if (rejecting) {
        cancelReject();
      } else {
        onReject();
      }
    }
  };

  return {
    rejecting,
    reason,
    setReason,
    approve,
    startReject,
    cancelReject,
    confirmReject,
    onKeyDown,
  };
}
