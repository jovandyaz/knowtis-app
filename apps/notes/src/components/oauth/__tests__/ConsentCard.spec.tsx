import i18n from '@/lib/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import type { OauthInteractionDetails } from '@knowtis/data-access-oauth';

import { ConsentCard } from '../ConsentCard';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const baseDetails: OauthInteractionDetails = {
  clientId: 'https://claude.ai',
  clientName: 'Claude',
  redirectHost: 'claude.ai',
  scopes: ['notes:read', 'notes:write', 'offline_access'],
  isCimdClient: true,
};

function renderCard(
  overrides: Partial<OauthInteractionDetails> = {},
  props: { decisionError?: Error | null } = {}
) {
  const onApprove = vi.fn();
  const onDeny = vi.fn();
  render(
    <ConsentCard
      details={{ ...baseDetails, ...overrides }}
      onApprove={onApprove}
      onDeny={onDeny}
      isApproving={false}
      isDenying={false}
      decisionError={props.decisionError ?? null}
    />
  );
  return { onApprove, onDeny };
}

describe('ConsentCard', () => {
  it('displays the redirect host prominently', () => {
    renderCard();
    expect(screen.getByText('claude.ai')).toBeInTheDocument();
  });

  it('renders one row per requested scope with human descriptions', () => {
    renderCard();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Read your notes')).toBeInTheDocument();
    expect(
      screen.getByText('Stay connected without signing in again')
    ).toBeInTheDocument();
  });

  it('shows the verified-by-URL hint for CIMD clients', () => {
    renderCard({ isCimdClient: true });
    expect(screen.getByText(/verified by url/i)).toBeInTheDocument();
  });

  it('fires onApprove when the approve button is clicked', async () => {
    const { onApprove, onDeny } = renderCard();
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('fires onDeny when the deny button is clicked', async () => {
    const { onApprove, onDeny } = renderCard();
    await userEvent.click(screen.getByRole('button', { name: /deny/i }));
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('falls back to the clientId host when no client name is provided', () => {
    renderCard({ clientName: null, clientId: 'https://cursor.sh' });
    expect(screen.getByText(/cursor\.sh/)).toBeInTheDocument();
  });

  it('disables both actions while a decision is in flight', () => {
    render(
      <ConsentCard
        details={baseDetails}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        isApproving
        isDenying={false}
        decisionError={null}
      />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('shows a terminal message and hides actions when the request was already answered (409)', () => {
    renderCard({}, { decisionError: new ApiClientError('Conflict', 409) });
    expect(screen.getByRole('alert')).toHaveTextContent(/already answered/i);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /deny/i })).toBeNull();
  });

  it('keeps the actions and shows a retry message on a server error (5xx)', () => {
    renderCard({}, { decisionError: new ApiClientError('Server Error', 503) });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /complete your request/i
    );
    expect(
      screen.getByRole('button', { name: /approve/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deny/i })).toBeInTheDocument();
  });
});
