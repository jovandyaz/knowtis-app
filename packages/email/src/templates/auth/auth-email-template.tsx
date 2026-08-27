import { Body, Container, Section, Text } from '@react-email/components';

import {
  BodyText,
  Button,
  EmailTitle,
  Footer,
  Header,
  Layout,
  VerificationCode,
} from '../../components';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/config';
import { useTranslations } from '../../i18n/use-translations';

export const AUTH_TRANSLATION_KEY = {
  VERIFY_EMAIL: 'verifyEmail',
  RESET_PASSWORD: 'resetPassword',
} as const;

type AuthEmailCodeProps =
  | { translationKey: typeof AUTH_TRANSLATION_KEY.VERIFY_EMAIL; code: string }
  | {
      translationKey: typeof AUTH_TRANSLATION_KEY.RESET_PASSWORD;
      code?: never;
    };

export type AuthEmailTemplateProps = {
  name: string;
  actionUrl: string;
  locale: Locale;
} & AuthEmailCodeProps;

export const AuthEmailTemplate = ({
  name,
  actionUrl,
  locale = DEFAULT_LOCALE,
  translationKey,
  code,
}: AuthEmailTemplateProps) => {
  const { t } = useTranslations(locale);
  const ns = `auth:${translationKey}`;
  const hasCode = code !== undefined;

  return (
    <Layout
      locale={locale}
      title={t(`${ns}.title`)}
      preview={t(`${ns}.preview`, hasCode ? { code } : undefined)}
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

              {hasCode && (
                <Section className="pt-6 text-center">
                  <Text className="text-muted-foreground text-sm m-0 mb-2">
                    {t(`${ns}.codeIntro`)}
                  </Text>

                  <VerificationCode code={code} />

                  <Text className="text-muted-foreground text-sm m-0 mt-2">
                    {t(`${ns}.codeExpiry`)}
                  </Text>
                </Section>
              )}

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
