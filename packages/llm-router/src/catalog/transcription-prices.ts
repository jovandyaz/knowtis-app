/** Per-second transcription prices; the index carries chat models only. */
export const TRANSCRIPTION_PRICES: Readonly<Record<string, number>> = {
  'openai:whisper-1': 0.0001,
};
