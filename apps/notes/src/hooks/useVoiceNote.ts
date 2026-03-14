import { useMutation } from '@tanstack/react-query';

import { httpClient } from '@knowtis/api-client';

export interface VoiceNoteInput {
  audio: Blob;
  mode: 'create-note' | 'insert';
}

export interface VoiceNoteResponse {
  noteId?: string;
  title: string;
  content: string;
  transcript: string;
}

async function postVoiceNote(
  input: VoiceNoteInput
): Promise<VoiceNoteResponse> {
  const formData = new FormData();
  const ext = input.audio.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('audio', input.audio, `recording.${ext}`);
  formData.append('mode', input.mode);

  return httpClient.post<VoiceNoteResponse>('/ai/voice-note', formData);
}

export function useVoiceNote() {
  return useMutation({
    mutationFn: postVoiceNote,
  });
}
