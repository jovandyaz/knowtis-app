import { useTranslation } from 'react-i18next';

interface LivePreviewProps {
  transcript: string;
  isSupported: boolean;
  speechFailed: boolean;
}

export function LivePreview({
  transcript,
  isSupported,
  speechFailed,
}: LivePreviewProps) {
  const { t } = useTranslation('notes');

  if (!isSupported || speechFailed) {
    return null;
  }

  return (
    <div className="max-h-24 overflow-y-auto rounded-lg bg-(--muted)/50 p-3">
      <p className="text-sm text-(--muted-foreground) leading-relaxed">
        {transcript || t('ai.voice.listening')}
      </p>
    </div>
  );
}
