import { useTranslation } from 'react-i18next';

import { Check, ShieldCheck } from 'lucide-react';

import type { OauthInteractionDetails } from '@knowtis/data-access-oauth';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  LoadingButton,
} from '@knowtis/design-system';

const SCOPE_DESCRIPTION_KEYS: Record<string, string> = {
  'notes:read': 'oauth.scopes.notesRead',
  'notes:write': 'oauth.scopes.notesWrite',
  'notes:share': 'oauth.scopes.notesShare',
  offline_access: 'oauth.scopes.offlineAccess',
};

function hostFromClientId(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return clientId;
  }
}

interface ConsentCardProps {
  details: OauthInteractionDetails;
  onApprove: () => void;
  onDeny: () => void;
  isApproving: boolean;
  isDenying: boolean;
}

export function ConsentCard({
  details,
  onApprove,
  onDeny,
  isApproving,
  isDenying,
}: ConsentCardProps) {
  const { t } = useTranslation('common');
  const clientName = details.clientName ?? hostFromClientId(details.clientId);
  const host = details.redirectHost || hostFromClientId(details.clientId);
  const busy = isApproving || isDenying;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t('oauth.title')}</CardTitle>
        <CardDescription>
          {t('oauth.requestingAccess', { client: clientName })}
        </CardDescription>
        {details.isCimdClient && (
          <Badge variant="secondary" className="mt-2 w-fit gap-1">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {t('oauth.verifiedByUrl')}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border border-(--border) bg-(--muted)/40 px-3 py-2">
          <p className="text-xs font-medium tracking-wide text-(--muted-foreground) uppercase">
            {t('oauth.redirectHostLabel')}
          </p>
          <p className="mt-0.5 text-sm font-semibold break-all text-(--foreground)">
            {host}
          </p>
          <p className="mt-1 text-xs text-(--muted-foreground)">
            {t('oauth.redirectHostNotice', { host })}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-(--foreground)">
            {t('oauth.permissionsTitle')}
          </p>
          <ul className="space-y-2">
            {details.scopes.map((scope) => (
              <li
                key={scope}
                className="flex items-start gap-2 text-sm text-(--muted-foreground)"
              >
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-(--primary)"
                  aria-hidden="true"
                />
                <span>
                  {t(SCOPE_DESCRIPTION_KEYS[scope] ?? scope, {
                    defaultValue: scope,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onDeny}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {t('oauth.deny')}
        </Button>
        <LoadingButton
          type="button"
          onClick={onApprove}
          loading={isApproving}
          disabled={busy}
          loadingText={t('oauth.approving')}
          className="w-full sm:w-auto"
        >
          {t('oauth.approve')}
        </LoadingButton>
      </CardFooter>
    </Card>
  );
}
