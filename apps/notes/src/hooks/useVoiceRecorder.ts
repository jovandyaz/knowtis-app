import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const win = window as unknown as Record<string, unknown>;
  return (
    (win['SpeechRecognition'] as SpeechRecognitionConstructor | undefined) ??
    (win['webkitSpeechRecognition'] as
      | SpeechRecognitionConstructor
      | undefined) ??
    null
  );
}

export type VoiceRecorderState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface UseVoiceRecorderOptions {
  maxDuration?: number;
}

export interface UseVoiceRecorderReturn {
  state: VoiceRecorderState;
  duration: number;
  liveTranscript: string;
  analyserNode: AnalyserNode | null;
  audioBlob: Blob | null;
  isSupported: boolean;
  isWebSpeechSupported: boolean;
  start: (preAcquiredStream?: MediaStream) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  cancel: () => void;
}

const DEFAULT_MAX_DURATION = 300;
const DATA_COLLECT_INTERVAL_MS = 1000;
const ANALYSER_FFT_SIZE = 2048;
const DEFAULT_SPEECH_LANGUAGE = 'en-US';

export function useVoiceRecorder(
  options: UseVoiceRecorderOptions = {}
): UseVoiceRecorderReturn {
  const maxDuration = options.maxDuration ?? DEFAULT_MAX_DURATION;

  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [duration, setDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const maxDurationRef = useRef(maxDuration);
  const stateRef = useRef<VoiceRecorderState>('idle');
  const startingRef = useRef(false);

  useEffect(() => {
    maxDurationRef.current = maxDuration;
  }, [maxDuration]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isSupported =
    typeof navigator?.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined';

  const isWebSpeechSupported = getSpeechRecognitionCtor() !== null;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      console.warn('[useVoiceRecorder] Recognition stop:', e);
    }
    recognitionRef.current = null;
  }, []);

  const releaseHardware = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close().catch((e) => {
        console.warn('[useVoiceRecorder] AudioContext close:', e);
      });
    }
    audioContextRef.current = null;
    setAnalyserNode(null);
  }, []);

  const releaseResources = useCallback(() => {
    clearTimer();
    stopSpeechRecognition();
    releaseHardware();
  }, [clearTimer, stopSpeechRecognition, releaseHardware]);

  const reset = useCallback(() => {
    releaseResources();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    durationRef.current = 0;
    startingRef.current = false;
    setDuration(0);
    setLiveTranscript('');
    setAudioBlob(null);
    setState('idle');
  }, [releaseResources]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }
    clearTimer();
    stopSpeechRecognition();
    recorder.stop();
  }, [clearTimer, stopSpeechRecognition]);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setDuration(durationRef.current);

      if (durationRef.current >= maxDurationRef.current) {
        stopRecording();
      }
    }, 1000);
  }, [clearTimer, stopRecording]);

  const startSpeechRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || DEFAULT_SPEECH_LANGUAGE;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setLiveTranscript(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error(
          '[useVoiceRecorder] SpeechRecognition error:',
          event.error
        );
      }
    };

    recognition.onend = () => {
      if (stateRef.current === 'recording') {
        try {
          recognition.start();
        } catch (e) {
          console.warn('[useVoiceRecorder] Recognition restart:', e);
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (error) {
      console.error(
        '[useVoiceRecorder] Failed to start SpeechRecognition:',
        error
      );
    }
  }, []);

  const start = useCallback(
    async (preAcquiredStream?: MediaStream) => {
      if (startingRef.current) {
        return;
      }
      startingRef.current = true;

      chunksRef.current = [];
      durationRef.current = 0;
      setDuration(0);
      setLiveTranscript('');
      setAudioBlob(null);

      let stream: MediaStream;
      if (preAcquiredStream) {
        stream = preAcquiredStream;
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
          startingRef.current = false;
          throw error;
        }
      }
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      setAnalyserNode(analyser);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : undefined;

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType ?? 'audio/webm',
        });
        setAudioBlob(blob);
        setState('stopped');
        releaseHardware();
      };

      recorder.start(DATA_COLLECT_INTERVAL_MS);
      mediaRecorderRef.current = recorder;

      setState('recording');
      startingRef.current = false;
      startTimer();
      startSpeechRecognition();
    },
    [startTimer, startSpeechRecognition, releaseHardware]
  );

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      return;
    }

    recorder.pause();
    clearTimer();
    stopSpeechRecognition();
    setState('paused');
  }, [clearTimer, stopSpeechRecognition]);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') {
      return;
    }

    recorder.resume();
    startTimer();
    startSpeechRecognition();
    setState('recording');
  }, [startTimer, startSpeechRecognition]);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    reset();
  }, [reset]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      releaseResources();
    };
  }, [releaseResources]);

  return {
    state,
    duration,
    liveTranscript,
    analyserNode,
    audioBlob,
    isSupported,
    isWebSpeechSupported,
    start,
    pause,
    resume,
    stop: stopRecording,
    cancel,
  };
}
