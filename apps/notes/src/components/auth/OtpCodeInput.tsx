import { forwardRef } from 'react';

import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth';

import { cn, Input, type InputProps } from '@knowtis/design-system';

const NON_DIGITS = /\D/g;
const CODE_MASK = '0'.repeat(VERIFICATION_CODE_LENGTH);

export interface OtpCodeInputProps extends Omit<
  InputProps,
  | 'autoComplete'
  | 'inputMode'
  | 'maxLength'
  | 'onChange'
  | 'onPaste'
  | 'placeholder'
  | 'type'
  | 'value'
> {
  value: string;
  onChange: (code: string) => void;
}

function toCode(raw: string): string {
  return raw.replace(NON_DIGITS, '').slice(0, VERIFICATION_CODE_LENGTH);
}

/**
 * One field rather than six boxes: a single input is what iOS/macOS autofill
 * fills from the verification email, and what a screen reader can announce.
 */
export const OtpCodeInput = forwardRef<HTMLInputElement, OtpCodeInputProps>(
  ({ className, value, onChange, ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={VERIFICATION_CODE_LENGTH}
      placeholder={CODE_MASK}
      value={value}
      onChange={(event) => onChange(toCode(event.target.value))}
      // maxLength truncates a paste before onChange can filter it, which would
      // eat the digits out of a "Your code is 123456" clipboard.
      onPaste={(event) => {
        event.preventDefault();
        onChange(toCode(event.clipboardData.getData('text')));
      }}
      className={cn(
        'h-14 text-center font-mono text-3xl tracking-[0.5em] indent-[0.5em] sm:h-12 sm:text-2xl',
        className
      )}
    />
  )
);

OtpCodeInput.displayName = 'OtpCodeInput';
