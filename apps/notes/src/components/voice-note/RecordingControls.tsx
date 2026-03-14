import { useTranslation } from 'react-i18next';

import type { VoiceRecorderState } from '@/hooks';
import { Pause, Play, Square, X } from 'lucide-react';

import { Button } from '@knowtis/design-system';

interface RecordingControlsProps {
  recorderState: VoiceRecorderState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
}

export function RecordingControls({
  recorderState,
  onPause,
  onResume,
  onStop,
  onCancel,
}: RecordingControlsProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="flex items-center justify-center gap-3">
      {recorderState === 'recording' ? (
        <Button variant="outline" size="sm" onClick={onPause} className="gap-1">
          <Pause className="h-4 w-4" />
          {t('ai.voice.pause')}
        </Button>
      ) : recorderState === 'paused' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onResume}
          className="gap-1"
        >
          <Play className="h-4 w-4" />
          {t('ai.voice.resume')}
        </Button>
      ) : null}

      <Button size="sm" onClick={onStop} className="gap-1">
        <Square className="h-3.5 w-3.5 fill-current" />
        {t('ai.voice.stop')}
      </Button>

      <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1">
        <X className="h-4 w-4" />
        {t('ai.voice.cancel')}
      </Button>
    </div>
  );
}
