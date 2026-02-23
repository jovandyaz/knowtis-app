import { Hr, Section, Text } from '@react-email/components';

import type { Locale } from '../i18n/config';
import { useTranslations } from '../i18n/use-translations';

interface FooterProps {
  locale: Locale;
}

export const Footer = ({ locale }: FooterProps) => {
  const { t } = useTranslations(locale);
  const year = new Date().getFullYear().toString();

  return (
    <Section className="pt-3 w-full">
      <Hr className="border-separator my-3" />
      <Text className="text-muted-foreground text-xs m-0 mb-1 leading-4 w-full">
        {t('common:footer.copyright', { year })}
      </Text>
      <Text className="text-muted-foreground text-xs m-0 leading-4 w-full">
        {t('common:footer.rights')}
      </Text>
    </Section>
  );
};
