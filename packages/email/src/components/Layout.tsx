import {
  Font,
  Head,
  Html,
  pixelBasedPreset,
  Preview,
  Tailwind,
} from '@react-email/components';

import tailwindConfig from '../../tailwind.config';
import { getHtmlLang, type Locale } from '../i18n/config';

interface LayoutProps {
  locale?: Locale;
  title?: string;
  preview?: string;
  children: React.ReactNode;
}

export const Layout = ({
  locale = 'en',
  title,
  preview,
  children,
}: LayoutProps) => {
  const htmlLang = getHtmlLang(locale);

  const mergedConfig = {
    ...tailwindConfig,
    presets: [pixelBasedPreset],
  };

  return (
    <Html lang={htmlLang} dir="ltr">
      <Tailwind config={mergedConfig}>
        <Head>
          {title && <title>{title}</title>}
          <meta name="color-scheme" content="light" />
          <meta name="supported-color-schemes" content="light" />
          <Font
            fontFamily="Inter"
            fallbackFontFamily="Helvetica"
            fontWeight={400}
            fontStyle="normal"
          />
          <Font
            fontFamily="Inter"
            fallbackFontFamily="Helvetica"
            fontWeight={600}
            fontStyle="normal"
          />
        </Head>
        {preview && <Preview>{preview}</Preview>}
        {children}
      </Tailwind>
    </Html>
  );
};
