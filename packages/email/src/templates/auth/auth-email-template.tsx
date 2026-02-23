import { Body, Container, Section, Text } from '@react-email/components';

import {
  BodyText,
  Button,
  EmailTitle,
  Footer,
  Header,
  Layout,
} from '../../components';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/config';
import { useTranslations } from '../../i18n/use-translations';

export const AUTH_TRANSLATION_KEY = {
  VERIFY_EMAIL: 'verifyEmail',
  RESET_PASSWORD: 'resetPassword',
} as const;

export type AuthTranslationKey =
  (typeof AUTH_TRANSLATION_KEY)[keyof typeof AUTH_TRANSLATION_KEY];

export interface AuthEmailTemplateProps {
  name: string;
  actionUrl: string;
  locale: Locale;
  translationKey: AuthTranslationKey;
}

export const AuthEmailTemplate = ({
  name,
  actionUrl,
  locale = DEFAULT_LOCALE,
  translationKey,
}: AuthEmailTemplateProps) => {
  const { t } = useTranslations(locale);
  const ns = `auth:${translationKey}`;

  return (
    <Layout
      locale={locale}
      title={t(`${ns}.title`)}
      preview={t(`${ns}.preview`)}
    >
      <Body className="bg-muted my-auto mx-auto font-sans">
        <Container className="mx-auto p-6 max-w-[600px]">
          <Section className="bg-white">
            <Header />
            <Section className="p-11">
              <EmailTitle>{t(`${ns}.title`)}</EmailTitle>

              <BodyText>
                <span className="font-semibold">
                  {t(`${ns}.greeting`, { name })}
                </span>
              </BodyText>

              <BodyText>{t(`${ns}.instruction`)}</BodyText>

              <Section className="py-6 text-center">
                <Button href={actionUrl}>{t(`${ns}.buttonText`)}</Button>
              </Section>

              <Text className="text-muted-foreground text-sm m-0">
                {t(`${ns}.disclaimer`)}
              </Text>

              <Text className="text-muted-foreground text-sm m-0 mt-2">
                {t(`${ns}.expiry`)}
              </Text>

              <Footer locale={locale} />
            </Section>
          </Section>
        </Container>
      </Body>
    </Layout>
  );
};
