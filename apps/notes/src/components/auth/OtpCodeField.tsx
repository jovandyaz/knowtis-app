import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import { FormField } from '@knowtis/design-system';

import { OtpCodeInput } from './OtpCodeInput';
import type { VerifyEmailCodeForm } from './useVerifyEmailCodeForm';

export interface OtpCodeFieldProps {
  /** Also the stem of the error element's id, which `FormField` derives. */
  id: string;
  form: VerifyEmailCodeForm;
  autoFocus?: boolean;
}

export const OtpCodeField = forwardRef<HTMLInputElement, OtpCodeFieldProps>(
  ({ id, form, autoFocus }, ref) => {
    const { t } = useTranslation('auth');

    return (
      <FormField
        id={id}
        label={t('verifyEmail.codeLabel')}
        error={form.errorMessage}
      >
        <OtpCodeInput
          ref={ref}
          id={id}
          value={form.code}
          onChange={form.onCodeChange}
          autoFocus={autoFocus}
          aria-invalid={!!form.errorMessage}
          aria-describedby={form.errorMessage ? `${id}-error` : undefined}
        />
      </FormField>
    );
  }
);

OtpCodeField.displayName = 'OtpCodeField';
