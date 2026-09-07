import { detectAiInput, type AiInputDetection } from '@knowtis/ai-gateway';

import type { AgentMessage } from './agent-message';
import { repairTranscriptOrphans } from './prune-transcript';

const MAX_PROJECTION_CHARS = 50_001;
const MAX_PROJECTION_NODES = 10_000;

/** Projects the visible replay text without serializing unbounded tool payloads. */
export function projectReplayText(message: AgentMessage): string {
  if (
    message.role === 'user' ||
    (message.role === 'assistant' && !message.parts?.length)
  ) {
    return message.content.slice(0, MAX_PROJECTION_CHARS);
  }
  let text = '';
  let visited = 0;
  const append = (value: string) => {
    text += value.slice(0, MAX_PROJECTION_CHARS - text.length);
  };
  function* values(value: object): Generator<unknown> {
    for (const key in value) {
      if (Object.hasOwn(value, key)) {
        if (!Array.isArray(value)) {
          yield key;
        }
        yield (value as Record<string, unknown>)[key];
      }
    }
  }
  for (const part of message.parts ?? []) {
    visited += 1;
    if (visited > MAX_PROJECTION_NODES) {
      return ' '.repeat(MAX_PROJECTION_CHARS);
    }
    if (message.role === 'assistant' && part.type === 'text') {
      append(part.text);
    } else if (message.role === 'tool' && part.type === 'tool-result') {
      const stack: Iterator<unknown>[] = [[part.output][Symbol.iterator]()];
      while (stack.length > 0 && text.length < MAX_PROJECTION_CHARS) {
        const entry = stack[stack.length - 1].next();
        if (entry.done) {
          stack.pop();
          continue;
        }
        visited += 1;
        if (visited > MAX_PROJECTION_NODES) {
          return ' '.repeat(MAX_PROJECTION_CHARS);
        }
        if (typeof entry.value === 'string') {
          append(entry.value);
          append('\n');
        } else if (entry.value !== null && typeof entry.value === 'object') {
          stack.push(values(entry.value));
        }
      }
    }
    if (text.length >= MAX_PROJECTION_CHARS) {
      break;
    }
  }
  return text;
}

/** Scans persisted history only; the caller guards the fresh user separately. */
export function sanitizeReplayHistory(
  messages: readonly AgentMessage[],
  options: { enforceAssistantAndTool: boolean }
): {
  messages: AgentMessage[];
  detections: {
    index: number;
    detection: AiInputDetection;
    disposition: 'observe' | 'block';
  }[];
} {
  const detections: {
    index: number;
    detection: AiInputDetection;
    disposition: 'observe' | 'block';
  }[] = [];
  const kept = messages.filter((message, index) => {
    const detection = detectAiInput(projectReplayText(message));
    if (detection.safe) {
      return true;
    }
    const disposition =
      message.role === 'user' || options.enforceAssistantAndTool
        ? 'block'
        : 'observe';
    detections.push({ index, detection, disposition });
    return disposition === 'observe';
  });
  return { messages: repairTranscriptOrphans(kept), detections };
}
