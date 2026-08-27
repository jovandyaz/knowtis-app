import type { Locale } from './i18n/config';
import { auth as en } from './i18n/locales/en/auth';
import { auth as es } from './i18n/locales/es/auth';
import type { TemplateName } from './templates';

type SubjectSection = keyof typeof en;
type AuthSubjects = Readonly<
  Record<SubjectSection, { readonly subject: string }>
>;

const AUTH_COPY: Readonly<Record<Locale, AuthSubjects>> = { en, es };

const SUBJECT_SECTION: Readonly<Record<TemplateName, SubjectSection>> = {
  'verify-email': 'verifyEmail',
  'reset-password': 'resetPassword',
};

/**
 * Subject line for a template, in the locale its body renders in. Kept beside
 * the body copy so the locale parity spec covers the most visible line too.
 */
export function emailSubject(template: TemplateName, locale: Locale): string {
  return AUTH_COPY[locale][SUBJECT_SECTION[template]].subject;
}
