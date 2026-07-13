import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@knowtis/design-system';
import type { SummaryArtifact } from '@knowtis/shared-types';

import { sanitizeAiHtml } from '../../lib/sanitize-ai-html';

const COPY_FEEDBACK_MS = 2000;

interface SummaryViewerProps {
  artifact: SummaryArtifact;
}

export function SummaryViewer({ artifact }: SummaryViewerProps) {
  const { t } = useTranslation('notes');
  const [copied, setCopied] = useState(false);
  const content = artifact.content;

  const handleCopy = async () => {
    try {
      const text = content.keyPoints.map((p) => `• ${p}`).join('\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t('ai.artifacts.summary.copied'));
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch (error) {
      console.error('[SummaryViewer] clipboard write failed', error);
      toast.error(t('ai.artifacts.summary.copyError'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copied
            ? t('ai.artifacts.summary.copied')
            : t('ai.artifacts.summary.copy')}
        </Button>
      </div>

      {content.summary && (
        <div
          className="prose prose-sm dark:prose-invert max-w-none text-foreground"
          dangerouslySetInnerHTML={{
            __html: sanitizeAiHtml(content.summary),
          }}
        />
      )}

      {content.keyPoints.length > 0 && (
        <>
          <h4 className="text-sm font-semibold text-foreground">
            {t('ai.artifacts.summary.keyPointsTitle')}
          </h4>
          <ul className="space-y-2.5">
            {content.keyPoints.map((point, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm text-foreground leading-relaxed">
                  {point}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
