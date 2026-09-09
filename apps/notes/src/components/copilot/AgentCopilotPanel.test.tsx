import { useAgentStore } from '@/stores/agent.store';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import {
  createAuthApiMock,
  createAuthWrapper,
  HARNESS_PROFILE,
} from '../../test/auth-harness';
import { AgentCopilotPanel } from './AgentCopilotPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('./AgentComposer', () => ({
  AgentComposer: () => <div data-testid="composer" />,
}));
vi.mock('./CopilotModelPicker', () => ({
  CopilotModelPicker: () => null,
}));
vi.mock('./AgentEmptyState', () => ({
  AgentEmptyState: () => <div data-testid="empty" />,
}));

const wrapper = createAuthWrapper(createAuthApiMock(), {
  user: HARNESS_PROFILE,
});

const anonymousWrapper = createAuthWrapper(createAuthApiMock(), {
  user: { ...HARNESS_PROFILE, isAnonymous: true },
});

function failWith(code: string) {
  act(() => {
    useAgentStore.setState({
      status: 'error',
      error: { code, message: 'refused' },
    });
  });
}

describe('AgentCopilotPanel', () => {
  beforeEach(() => {
    useVerifyEmailStore.setState({ isOpen: false });
    useAgentStore.setState({
      status: 'idle',
      error: null,
      answeredError: null,
      messages: [],
    });
  });

  it('offers verification when the copilot share is refused for an unverified account', () => {
    render(<AgentCopilotPanel />, { wrapper });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('names the reason instead of a generic AI failure', () => {
    render(<AgentCopilotPanel />, { wrapper });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(screen.getByText('ai.errors.emailNotVerified')).toBeInTheDocument();
  });

  it('does not offer a code to a visitor with no address', () => {
    render(<AgentCopilotPanel />, { wrapper: anonymousWrapper });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('does not tell a visitor with no address to verify one', () => {
    render(<AgentCopilotPanel />, { wrapper: anonymousWrapper });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(screen.getByText('ai.errors.generic')).toBeInTheDocument();
    expect(
      screen.queryByText('ai.errors.emailNotVerified')
    ).not.toBeInTheDocument();
  });

  it('does not offer again for a refusal it has already answered', () => {
    const { unmount } = render(<AgentCopilotPanel />, { wrapper });
    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);
    expect(useVerifyEmailStore.getState().isOpen).toBe(true);

    act(() => {
      useVerifyEmailStore.getState().close();
    });
    unmount();
    render(<AgentCopilotPanel />, { wrapper });

    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('offers again when the copilot is refused a second time', () => {
    render(<AgentCopilotPanel />, { wrapper });
    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);
    act(() => {
      useVerifyEmailStore.getState().close();
    });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('leaves any other copilot failure alone', () => {
    render(<AgentCopilotPanel />, { wrapper });

    failWith('AGENT_PERMISSION_DENIED');

    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('shows a stop notice when an empty assistant response ends', () => {
    useAgentStore.setState({
      status: 'done',
      messages: [
        { id: 'm1', role: 'user', content: 'Summarize this note' },
        {
          id: 'm2',
          role: 'assistant',
          content: '',
          stopReason: 'token_budget',
        },
      ],
    });

    const { unmount } = render(<AgentCopilotPanel />, { wrapper });

    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.stopReason.token_budget'
    );

    unmount();
    render(<AgentCopilotPanel />, { wrapper });
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.stopReason.token_budget'
    );
  });

  it('keeps partial assistant text and its sources with the stop notice', () => {
    useAgentStore.setState({
      status: 'done',
      messages: [
        { id: 'm1', role: 'user', content: 'Summarize this note' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Partial answer',
          sources: [{ id: 'n1', title: 'Productividad' }],
          stopReason: 'length',
        },
      ],
    });

    render(<AgentCopilotPanel />, { wrapper });

    expect(screen.getByText('Partial answer')).toBeInTheDocument();
    expect(screen.getByText('Productividad')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.stopReason.length'
    );
  });

  it('keeps a pending proposal available', () => {
    useAgentStore.setState({
      status: 'pendingProposal',
      messages: [
        { id: 'm1', role: 'user', content: 'Create a note' },
        { id: 'm2', role: 'assistant', content: '' },
      ],
      pendingProposal: {
        id: 'p1',
        kind: 'create',
        targetNoteId: null,
        summary: 'Create note "GTD"',
        previewHtml: null,
        payload: { title: 'GTD' },
      },
    });

    render(<AgentCopilotPanel />, { wrapper });

    expect(screen.getByText('Create note "GTD"')).toBeInTheDocument();
  });
});
