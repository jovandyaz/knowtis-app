import i18n from '@/lib/i18n';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { AuthErrorCodes } from '@jovandyaz/auth';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import {
  createAuthApiMock,
  createAuthWrapper,
  HARNESS_PROFILE,
} from '../../test/auth-harness';
import { VerifyCodeStep } from './VerifyCodeStep';
import { VerifyEmailDialog } from './VerifyEmailDialog';

const CODE = '123456';
const CODE_LABEL = 'Verification code';
const VERIFY_BUTTON = 'Verify email';
const INVALID_CODE = new ApiClientError(
  'Invalid code',
  400,
  AuthErrorCodes.INVALID_VERIFICATION_CODE
);

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useVerifyEmailStore.setState({ isOpen: false, source: 'inApp' });
});

describe.each(['standalone', 'modal'] as const)(
  '%s verification focus',
  (mode) => {
    function renderVerification(api: ReturnType<typeof createAuthApiMock>) {
      const view = render(
        mode === 'modal' ? (
          <VerifyEmailDialog />
        ) : (
          <VerifyCodeStep
            email={HARNESS_PROFILE.email}
            onVerified={vi.fn()}
            onSkip={vi.fn()}
          />
        ),
        { wrapper: createAuthWrapper(api, { user: HARNESS_PROFILE }) }
      );
      if (mode === 'modal') {
        act(() => useVerifyEmailStore.getState().open('inApp'));
      }
      return view;
    }

    it('refocuses after each committed invalid-code result without later rerender steals', async () => {
      let pending = Promise.withResolvers<undefined>();
      const api = createAuthApiMock({
        verifyEmailCode: vi.fn(() => pending.promise),
      });
      renderVerification(api);
      const code = screen.getByLabelText(CODE_LABEL);
      await userEvent.type(code, CODE);

      for (let attempt = 0; attempt < 2; attempt++) {
        const submit = screen.getByRole('button', { name: VERIFY_BUTTON });
        await userEvent.click(submit);
        await waitFor(() => expect(submit).toBeDisabled());
        expect(api.verifyEmailCode).toHaveBeenNthCalledWith(attempt + 1, CODE);
        expect(code).not.toHaveFocus();

        await act(async () => pending.reject(INVALID_CODE));

        await screen.findByText(
          "That code isn't right. Check the email and try again."
        );
        expect(submit).toBeEnabled();
        expect(code).toBeEnabled();
        expect(code).toHaveValue(CODE);
        expect(code).toHaveFocus();

        const otherAction = screen.getByRole('button', {
          name: mode === 'modal' ? 'Resend verification email' : 'Skip for now',
        });
        act(() => otherAction.focus());
        await act(async () => {
          await i18n.changeLanguage('es');
        });
        expect(otherAction).toHaveFocus();
        await act(async () => {
          await i18n.changeLanguage('en');
        });
        expect(otherAction).toHaveFocus();
        pending = Promise.withResolvers<undefined>();
      }
    });

    it('does not move focus when a pending rejection arrives after unmount', async () => {
      const pending = Promise.withResolvers<undefined>();
      const { unmount } = renderVerification(
        createAuthApiMock({ verifyEmailCode: vi.fn(() => pending.promise) })
      );
      const code = screen.getByLabelText(CODE_LABEL);
      await userEvent.type(code, CODE);
      const submit = screen.getByRole('button', { name: VERIFY_BUTTON });
      await userEvent.click(submit);
      await waitFor(() => expect(submit).toBeDisabled());
      const focus = vi.spyOn(code, 'focus');

      unmount();
      render(<button type="button">Next workflow</button>);
      const next = screen.getByRole('button', { name: 'Next workflow' });
      await userEvent.click(next);

      await act(async () => pending.reject(INVALID_CODE));

      expect(next).toHaveFocus();
      expect(focus).not.toHaveBeenCalled();
    });
  }
);
