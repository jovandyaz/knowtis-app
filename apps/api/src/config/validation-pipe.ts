import { I18nValidationPipe } from 'nestjs-i18n';

/** The global validation pipe `main.ts` installs, for any spec that drives the API over HTTP too. */
export function createValidationPipe(): I18nValidationPipe {
  return new I18nValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
}
