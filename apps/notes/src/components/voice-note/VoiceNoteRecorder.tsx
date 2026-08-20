import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { useVoiceNote, useVoiceRecorder } from '@/hooks';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useCreateNote } from '@knowtis/data-access-notes';
import {
  AudioWaveform,
  Button,
  RecordingModal,
  RecordingTimer,
  VoiceButton,
} from '@knowtis/design-system';

import { LivePreview } from './LivePreview';
import { RecordingControls } from './RecordingControls';
import { VoiceNoteResult } from './VoiceNoteResult';

function getMicrophoneErrorMessage(
  error: unknown,
  t: ReturnType<typeof useTranslation<'notes'>>['t']
): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return t('ai.voice.micPermissionDenied');
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return t('ai.voice.micNotFound');
  }
  if (error instanceof Error) {
    return t('ai.voice.micError', { message: error.message });
  }
  return t('ai.voice.micGenericError');
}

type FlowState = 'idle' | 'recording' | 'processing' | 'result' | 'error';

const MAX_DURATION = 300;

interface VoiceNoteRecorderProps {
  size?: 'sm' | 'default' | 'lg' | 'xl';
  emphasis?: 'solid' | 'quiet';
  mode?: 'create' | 'insert';
  open?: boolean;
  onClose?: () => void;
  onInsert?: (content: string) => void;
  preAcquiredStream?: MediaStream | null;
}

export function VoiceNoteRecorder({
  size = 'lg',
  emphasis = 'solid',
  mode = 'create',
  open: controlledOpen,
  onClose: controlledOnClose,
  onInsert,
  preAcquiredStream,
}: VoiceNoteRecorderProps) {
  const { t } = useTranslation('notes');
  const [internalOpen, setInternalOpen] = useState(false);

  const isInsertMode = mode === 'insert';
  const modalOpen = isInsertMode ? !!controlledOpen : internalOpen;

  const navigate = useNavigate();
  const recorder = useVoiceRecorder({ maxDuration: MAX_DURATION });

  const {
    mutate: submitVoiceNote,
    isIdle: isVoiceNoteIdle,
    isSuccess: isVoiceNoteSuccess,
    isError: isVoiceNoteError,
    isPending: isVoiceNotePending,
    data: voiceNoteData,
    reset: resetVoiceNote,
  } = useVoiceNote();
  const createNote = useCreateNote();

  const flowState: FlowState = (() => {
    if (!modalOpen) {
      return 'idle';
    }
    if (isVoiceNoteSuccess) {
      return 'result';
    }
    if (isVoiceNoteError) {
      return 'error';
    }
    if (isVoiceNotePending) {
      return 'processing';
    }
    if (recorder.state === 'recording' || recorder.state === 'paused') {
      return 'recording';
    }
    if (recorder.state === 'stopped' && recorder.audioBlob) {
      return 'processing';
    }
    return 'idle';
  })();

  const recorderStart = recorder.start;
  useEffect(() => {
    if (isInsertMode && controlledOpen && preAcquiredStream) {
      recorderStart(preAcquiredStream).catch((error: unknown) => {
        console.error('[VoiceNoteRecorder] Failed to start recording:', error);
        toast.error(getMicrophoneErrorMessage(error, t));
        controlledOnClose?.();
      });
    }
  }, [
    isInsertMode,
    controlledOpen,
    preAcquiredStream,
    recorderStart,
    controlledOnClose,
    t,
  ]);

  useEffect(() => {
    if (recorder.state === 'stopped' && recorder.audioBlob && isVoiceNoteIdle) {
      submitVoiceNote(
        {
          audio: recorder.audioBlob,
          mode: isInsertMode ? 'insert' : 'create-note',
        },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : t('ai.voice.errorMessage')
            );
          },
        }
      );
    }
  }, [
    recorder.state,
    recorder.audioBlob,
    isVoiceNoteIdle,
    submitVoiceNote,
    isInsertMode,
    t,
  ]);

  const handleOpen = useCallback(async () => {
    setInternalOpen(true);

    try {
      await recorder.start();
    } catch (error) {
      console.error('[VoiceNoteRecorder] Failed to start recording:', error);
      toast.error(getMicrophoneErrorMessage(error, t));
      setInternalOpen(false);
    }
  }, [recorder, t]);

  const handleClose = useCallback(() => {
    recorder.cancel();
    resetVoiceNote();
    if (isInsertMode) {
      controlledOnClose?.();
    } else {
      setInternalOpen(false);
    }
  }, [recorder, resetVoiceNote, isInsertMode, controlledOnClose]);

  const handleStartRecording = useCallback(async () => {
    try {
      await recorder.start();
    } catch (error) {
      console.error('[VoiceNoteRecorder] Failed to start recording:', error);
      toast.error(getMicrophoneErrorMessage(error, t));
      handleClose();
    }
  }, [recorder, handleClose, t]);

  const handleSaveNote = useCallback(() => {
    if (!voiceNoteData) {
      return;
    }

    if (isInsertMode) {
      onInsert?.(voiceNoteData.content);
      handleClose();
      return;
    }

    const { title, content } = voiceNoteData;

    createNote.mutate(
      { title, content },
      {
        onSuccess: (newNote) => {
          handleClose();
          navigate({
            to: ROUTES.NOTE,
            params: { noteId: newNote.id },
          });
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : t('create.failedToCreate')
          );
        },
      }
    );
  }, [
    voiceNoteData,
    createNote,
    navigate,
    handleClose,
    isInsertMode,
    onInsert,
    t,
  ]);

  const handleRetry = useCallback(async () => {
    resetVoiceNote();

    try {
      await recorder.start();
    } catch (error) {
      console.error('[VoiceNoteRecorder] Failed to restart recording:', error);
      toast.error(getMicrophoneErrorMessage(error, t));
      handleClose();
    }
  }, [recorder, resetVoiceNote, handleClose, t]);

  if (!recorder.isSupported) {
    return null;
  }

  const isPreventClose =
    flowState === 'recording' || flowState === 'processing';

  const voiceButtonState = (() => {
    if (isVoiceNotePending || createNote.isPending) {
      return 'processing' as const;
    }
    return 'idle' as const;
  })();

  const actionLabel = isInsertMode
    ? t('ai.voice.insert')
    : t('ai.voice.createNote');

  return (
    <>
      {!isInsertMode && (
        <VoiceButton
          state={voiceButtonState}
          emphasis={emphasis}
          size={size}
          onClick={handleOpen}
          aria-label={t('ai.voice.recordVoiceNote')}
        />
      )}

      <RecordingModal
        open={modalOpen}
        title={t('ai.voice.title')}
        onOpenChange={(open) => {
          if (!open) {
            handleClose();
          }
        }}
        preventClose={isPreventClose}
      >
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-(--foreground)">
            {flowState === 'recording' && t('ai.voice.recording')}
            {flowState === 'processing' && t('ai.voice.processing')}
            {flowState === 'result' && t('ai.voice.ready')}
            {flowState === 'error' && t('ai.voice.error')}
            {flowState === 'idle' && t('ai.voice.title')}
          </h2>

          {flowState === 'recording' && (
            <>
              <AudioWaveform analyserNode={recorder.analyserNode} />

              <RecordingTimer
                elapsed={recorder.duration}
                maxDuration={MAX_DURATION}
                isRecording={recorder.state === 'recording'}
              />

              <LivePreview
                transcript={recorder.liveTranscript}
                isSupported={recorder.isWebSpeechSupported}
                speechFailed={recorder.speechFailed}
              />

              <RecordingControls
                recorderState={recorder.state}
                onPause={recorder.pause}
                onResume={recorder.resume}
                onStop={recorder.stop}
                onCancel={handleClose}
              />
            </>
          )}

          {flowState === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-10 w-10 animate-spin text-(--primary)" />
              <p className="text-sm text-(--muted-foreground)">
                {t('ai.voice.transcribing')}
              </p>
            </div>
          )}

          {flowState === 'result' && voiceNoteData && (
            <VoiceNoteResult
              title={voiceNoteData.title}
              content={voiceNoteData.content}
              onCreateNote={handleSaveNote}
              onRetry={handleRetry}
              onDiscard={handleClose}
              actionLabel={actionLabel}
            />
          )}

          {flowState === 'idle' && isInsertMode && (
            <div className="flex flex-col items-center gap-4 py-8">
              <VoiceButton
                size="xl"
                onClick={handleStartRecording}
                aria-label={t('ai.voice.startRecording')}
              />
              <p className="text-sm text-(--muted-foreground)">
                {t('ai.voice.tapToStart')}
              </p>
            </div>
          )}

          {flowState === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <p className="text-sm text-(--muted-foreground)">
                {t('ai.voice.errorMessage')}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  {t('ai.voice.discard')}
                </Button>
                <Button size="sm" onClick={handleRetry}>
                  {t('ai.voice.retry')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </RecordingModal>
    </>
  );
}
