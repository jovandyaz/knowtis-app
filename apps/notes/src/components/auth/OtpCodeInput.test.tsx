import { useState } from 'react';

import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { OtpCodeInput } from './OtpCodeInput';

const LABEL = 'Verification code';
// A real one-time-code line carries digits after the code — a reference number,
// a clock — so the cap in `toCode` is what keeps them out of the field.
const PASTED_LINE = 'Your code is 123456 (ref 9087, expires 10:30)';
const CODE = '123456';

function ControlledCode() {
  const [code, setCode] = useState('');

  return (
    <>
      <label htmlFor="code">{LABEL}</label>
      <OtpCodeInput id="code" value={code} onChange={setCode} />
    </>
  );
}

describe('OtpCodeInput', () => {
  it('is a single field the phone keyboard and Mail autofill can serve', () => {
    render(<ControlledCode />);

    const input = screen.getByLabelText(LABEL);

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute(
      'maxlength',
      String(VERIFICATION_CODE_LENGTH)
    );
  });

  it('masks the field with one digit per digit of the code', () => {
    render(<ControlledCode />);

    expect(
      screen.getByLabelText(LABEL).getAttribute('placeholder')
    ).toHaveLength(VERIFICATION_CODE_LENGTH);
  });

  it('keeps the digits and drops everything else', async () => {
    render(<ControlledCode />);

    const input = screen.getByLabelText(LABEL);
    await userEvent.type(input, 'a1-b2 c3');

    expect(input).toHaveValue('123');
  });

  it('replaces what is already typed with the digits of a pasted line', async () => {
    render(<ControlledCode />);

    const input = screen.getByLabelText(LABEL);
    await userEvent.type(input, '99');
    await userEvent.paste(PASTED_LINE);

    expect(input).toHaveValue(CODE);
  });

  it('stops at the code and drops the digits trailing it', async () => {
    render(<ControlledCode />);

    const input = screen.getByLabelText(LABEL);
    await userEvent.click(input);
    await userEvent.paste(PASTED_LINE);

    expect(input).toHaveValue(CODE);
    expect((input as HTMLInputElement).value).toHaveLength(
      VERIFICATION_CODE_LENGTH
    );
  });

  it('takes the browser out of the paste', async () => {
    render(<ControlledCode />);

    const input = screen.getByLabelText(LABEL);
    let defaultPrevented: boolean | undefined;
    const record = (event: Event) => {
      defaultPrevented = event.defaultPrevented;
    };
    document.addEventListener('paste', record);

    await userEvent.click(input);
    await userEvent.paste(PASTED_LINE);
    document.removeEventListener('paste', record);

    expect(defaultPrevented).toBe(true);
  });
});

// NOT COVERED HERE: the consequence of that preventDefault. jsdom does not
// enforce `maxLength`, so the browser behaviour it exists to pre-empt — the
// field truncating a pasted line to its first 6 characters ("Your c") before
// `onChange` can filter it — cannot be reproduced in this environment. The
// assertion above pins the call; only a real browser can pin the outcome.
