import { Section, Text } from '@react-email/components';

import { TrackingCode } from '../design-tokens';

interface VerificationCodeProps {
  code: string;
}

export const VerificationCode = ({ code }: VerificationCodeProps) => {
  return (
    <Section className="bg-muted border border-solid border-separator rounded-md py-5 text-center">
      <Text
        className="text-foreground text-3xl font-mono font-bold tracking-code m-0"
        // Without a matching indent, the letter spacing trailing the last digit
        // pulls the code off-center.
        style={{ textIndent: TrackingCode }}
      >
        {code}
      </Text>
    </Section>
  );
};
