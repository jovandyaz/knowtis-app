import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';

import { Button, ErrorState } from '@knowtis/design-system';

interface SharedNoteAccessErrorProps {
  isNotFound: boolean;
  offerSignIn: boolean;
  onRetry: () => void;
}

export function SharedNoteAccessError({
  isNotFound,
  offerSignIn,
  onRetry,
}: SharedNoteAccessErrorProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <ErrorState
        fullHeight={false}
        title={
          isNotFound
            ? t('shared.linkNotFound')
            : tCommon('errors.somethingWentWrong')
        }
        message={
          isNotFound
            ? t('shared.linkNotFoundDesc')
            : t('shared.failedToLoadShared')
        }
        {...(isNotFound
          ? {}
          : { onRetry, retryLabel: tCommon('buttons.tryAgain') })}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {offerSignIn ? (
          <Link to={ROUTES.LOGIN} search={{ redirect: undefined }}>
            <Button size="sm">{t('shared.signIn')}</Button>
          </Link>
        ) : null}
        <Link to={ROUTES.DASHBOARD}>
          <Button variant="outline" size="sm">
            {t('shared.goToKnowtis')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
