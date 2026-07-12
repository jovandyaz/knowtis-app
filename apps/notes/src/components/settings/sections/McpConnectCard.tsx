import { useTranslation } from 'react-i18next';

import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  Input,
} from '@knowtis/design-system';

const MCP_URL = import.meta.env.VITE_MCP_URL ?? 'https://mcp.knowtis.app/mcp';

const DOCS_URL =
  'https://github.com/jovandyaz/knowtis-app/blob/main/docs/MCP.md';

function cursorDeeplink(url: string): string {
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=knowtis&config=${btoa(
    JSON.stringify({ url })
  )}`;
}

const STEP_KEYS = [
  'integrations.connect.step1',
  'integrations.connect.step2',
  'integrations.connect.step3',
] as const;

export function McpConnectCard() {
  const { t } = useTranslation('common');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(MCP_URL);
    toast.success(t('integrations.connect.urlCopied'));
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1">
          <h3 className="font-medium text-(--foreground)">
            {t('integrations.connect.title')}
          </h3>
          <p className="text-sm text-(--muted-foreground)">
            {t('integrations.connect.description')}
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="mcp-server-url"
            className="text-xs font-medium tracking-wide text-(--muted-foreground) uppercase"
          >
            {t('integrations.connect.urlLabel')}
          </label>
          <div className="flex gap-2">
            <Input
              id="mcp-server-url"
              value={MCP_URL}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              aria-label={t('integrations.connect.copyUrl')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ol className="space-y-2 text-sm text-(--muted-foreground)">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="flex gap-2">
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--muted) text-xs font-medium text-(--foreground)"
              >
                {index + 1}
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          <a
            href={cursorDeeplink(MCP_URL)}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('integrations.connect.addToCursor')}
          </a>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            {t('integrations.connect.docs')}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
