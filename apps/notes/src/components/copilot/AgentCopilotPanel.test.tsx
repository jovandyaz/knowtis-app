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
vi.mock('./AgentComposer', () => ({
  AgentComposer: () => <div data-testid="composer" />,
}));
vi.mock('./CopilotModelPicker', () => ({
  CopilotModelPicker: () => null,
}));
vi.mock('./AgentMessageList', () => ({
  AgentMessageList: () => <div data-testid="messages" />,
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
    useAgentStore.setState({ status: 'idle', error: null, messages: [] });
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
});
