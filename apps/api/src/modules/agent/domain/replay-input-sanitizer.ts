import {
  detectAiInput,
  locateInjectionSpans,
  MAX_GUARD_SCAN_CHARS,
  type AiInputDetection,
  type AiInputDisposition,
} from '@knowtis/ai-gateway';

import {
  textOfParts,
  type AgentMessage,
  type AgentMessagePart,
  type AgentRole,
  type AgentToolCallPart,
  type AgentToolResultPart,
} from './agent-message';
import { coalesceMessages } from './coalesce-messages';
import { repairTranscriptOrphans } from './prune-transcript';
import {
  NOTE_CONTENT_NOTE,
  WITHHELD_CONTENT,
  type AgentNote,
} from './retrieval';

// One character past the scan ceiling so a truncated projection always trips `too_large`.
const MAX_PROJECTION_CHARS = MAX_GUARD_SCAN_CHARS + 1;
const MAX_PROJECTION_NODES = 10_000;

/** Stands in for each replayed assistant sentence or tool-call string that failed the injection check, and for a whole text part that cannot be redacted clean. */
export const REPLAY_REDACTION_MARKER =
  '[Quoted instruction withheld from replay: it failed the injection safety check]';

const SENTENCES = new Intl.Segmenter(undefined, { granularity: 'sentence' });

export interface ReplayDetection {
  readonly index: number;
  readonly detection: AiInputDetection;
  readonly disposition: AiInputDisposition;
  /** Sentences and tool-call strings replaced by `REPLAY_REDACTION_MARKER`; a part withheld whole is not counted. */
  readonly redactedSpans: number;
}

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
  let exhausted = false;
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
  const appendLeaves = (root: unknown) => {
    const stack: Iterator<unknown>[] = [[root][Symbol.iterator]()];
    while (stack.length > 0 && text.length < MAX_PROJECTION_CHARS) {
      const entry = stack[stack.length - 1].next();
      if (entry.done) {
        stack.pop();
        continue;
      }
      visited += 1;
      if (visited > MAX_PROJECTION_NODES) {
        exhausted = true;
        return;
      }
      if (typeof entry.value === 'string') {
        append(entry.value);
        append('\n');
      } else if (entry.value !== null && typeof entry.value === 'object') {
        stack.push(values(entry.value));
      }
    }
  };
  for (const part of message.parts ?? []) {
    visited += 1;
    if (visited > MAX_PROJECTION_NODES) {
      return ' '.repeat(MAX_PROJECTION_CHARS);
    }
    if (message.role === 'assistant' && part.type === 'text') {
      append(part.text);
    } else if (message.role === 'assistant' && part.type === 'tool-call') {
      appendLeaves(part.input);
    } else if (message.role === 'tool' && part.type === 'tool-result') {
      appendLeaves(part.output);
    }
    if (exhausted) {
      return ' '.repeat(MAX_PROJECTION_CHARS);
    }
    if (text.length >= MAX_PROJECTION_CHARS) {
      break;
    }
  }
  return text;
}

interface Neutralized<T> {
  readonly value: T;
  readonly withheld: boolean;
  readonly redactedSpans: number;
}

interface NeutralizedMessage {
  readonly message: AgentMessage;
  readonly disposition: Exclude<AiInputDisposition, 'block'>;
  readonly redactedSpans: number;
}

function unchanged<T>(value: T): Neutralized<T> {
  return { value, withheld: false, redactedSpans: 0 };
}

function withheld<T>(value: T): Neutralized<T> {
  return { value, withheld: true, redactedSpans: 0 };
}

function scansClean(message: AgentMessage): boolean {
  return detectAiInput(projectReplayText(message)).safe;
}

function partScansClean(role: AgentRole, part: AgentMessagePart): boolean {
  return scansClean({ role, content: '', parts: [part] });
}

function redactSentences(text: string): Neutralized<string> | null {
  const spans = locateInjectionSpans(text);
  if (spans === null) {
    return null;
  }
  let redacted = '';
  let redactedSpans = 0;
  for (const { segment, index } of SENTENCES.segment(text)) {
    const end = index + segment.length;
    const sentence = segment.trim();
    if (
      sentence &&
      spans.some((span) => span.start < end && span.end > index)
    ) {
      const lead = segment.length - segment.trimStart().length;
      redacted += `${segment.slice(0, lead)}${REPLAY_REDACTION_MARKER}${segment.slice(lead + sentence.length)}`;
      redactedSpans += 1;
    } else {
      redacted += segment;
    }
  }
  return { value: redacted, withheld: false, redactedSpans };
}

function neutralizeText(text: string): Neutralized<string> {
  if (detectAiInput(text).safe) {
    return unchanged(text);
  }
  const redacted = redactSentences(text);
  return redacted && detectAiInput(redacted.value).safe
    ? redacted
    : withheld(REPLAY_REDACTION_MARKER);
}

// Copies iteratively under the projection's node bound, so a deep or cyclic
// input is refused instead of overflowing the stack; defineProperty keeps a
// `__proto__` key an own property, as it was in the stored JSON.
function redactLeaves(input: unknown): Neutralized<unknown> | null {
  let visited = 0;
  let redactedSpans = 0;
  const pending: (() => void)[] = [];
  const copy = (value: unknown): unknown => {
    visited += 1;
    if (visited > MAX_PROJECTION_NODES) {
      return null;
    }
    if (typeof value === 'string') {
      if (detectAiInput(value).score === 0) {
        return value;
      }
      redactedSpans += 1;
      return REPLAY_REDACTION_MARKER;
    }
    if (Array.isArray(value)) {
      const items: readonly unknown[] = value;
      const target: unknown[] = [];
      pending.push(() => {
        for (const item of items) {
          target.push(copy(item));
        }
      });
      return target;
    }
    if (value !== null && typeof value === 'object') {
      const target: Record<string, unknown> = {};
      pending.push(() => {
        for (const [key, item] of Object.entries(value)) {
          Object.defineProperty(target, key, {
            value: copy(item),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
      });
      return target;
    }
    return value;
  };
  const root = copy(input);
  while (pending.length > 0 && visited <= MAX_PROJECTION_NODES) {
    pending.pop()?.();
  }
  return visited > MAX_PROJECTION_NODES
    ? null
    : { value: root, withheld: false, redactedSpans };
}

function neutralizeToolCall(
  part: AgentToolCallPart
): Neutralized<AgentToolCallPart> {
  if (partScansClean('assistant', part)) {
    return unchanged(part);
  }
  const redacted = redactLeaves(part.input);
  const candidate = redacted && { ...part, input: redacted.value };
  return candidate && partScansClean('assistant', candidate)
    ? {
        value: candidate,
        withheld: false,
        redactedSpans: redacted.redactedSpans,
      }
    : withheld({ ...part, input: {} });
}

function withheldResult(part: AgentToolResultPart): AgentToolResultPart {
  const output: Pick<AgentNote, 'content' | 'contentStatus'> & {
    readonly note: string;
  } = {
    note: NOTE_CONTENT_NOTE,
    contentStatus: 'withheld',
    content: WITHHELD_CONTENT,
  };
  return {
    type: 'tool-result',
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    outputType: 'json',
    output,
  };
}

function neutralizePart(
  role: AgentRole,
  part: AgentMessagePart
): Neutralized<AgentMessagePart> {
  if (role === 'assistant' && part.type === 'text') {
    const text = neutralizeText(part.text);
    return { ...text, value: { type: 'text', text: text.value } };
  }
  if (role === 'assistant' && part.type === 'tool-call') {
    return neutralizeToolCall(part);
  }
  if (role === 'tool' && part.type === 'tool-result') {
    return partScansClean(role, part)
      ? unchanged(part)
      : withheld(withheldResult(part));
  }
  return unchanged(part);
}

function withholdPart(
  role: AgentRole,
  part: AgentMessagePart
): AgentMessagePart {
  if (role === 'assistant' && part.type === 'text') {
    return { type: 'text', text: REPLAY_REDACTION_MARKER };
  }
  if (role === 'assistant' && part.type === 'tool-call') {
    return { ...part, input: {} };
  }
  if (role === 'tool' && part.type === 'tool-result') {
    return withheldResult(part);
  }
  return part;
}

function withParts(
  message: AgentMessage,
  parts: readonly AgentMessagePart[]
): AgentMessage {
  return {
    role: message.role,
    content: message.role === 'assistant' ? textOfParts(parts) : '',
    parts,
  };
}

function neutralizeParts(message: AgentMessage): Neutralized<AgentMessage> {
  if (!message.parts?.length) {
    const text = neutralizeText(message.content);
    return { ...text, value: { ...message, content: text.value } };
  }
  const outcomes = message.parts.map((part) =>
    neutralizePart(message.role, part)
  );
  return {
    value: withParts(
      message,
      outcomes.map((outcome) => outcome.value)
    ),
    withheld: outcomes.some((outcome) => outcome.withheld),
    redactedSpans: outcomes.reduce(
      (total, outcome) => total + outcome.redactedSpans,
      0
    ),
  };
}

function withholdAll(message: AgentMessage): AgentMessage {
  return message.parts?.length
    ? withParts(
        message,
        message.parts.map((part) => withholdPart(message.role, part))
      )
    : { ...message, content: REPLAY_REDACTION_MARKER };
}

function neutralize(message: AgentMessage): NeutralizedMessage | null {
  if (message.role === 'user') {
    return null;
  }
  const partial = neutralizeParts(message);
  if (scansClean(partial.value)) {
    return {
      message: partial.value,
      disposition: partial.withheld ? 'withhold' : 'redact',
      redactedSpans: partial.redactedSpans,
    };
  }
  const whole = withholdAll(message);
  return scansClean(whole)
    ? { message: whole, disposition: 'withhold', redactedSpans: 0 }
    : null;
}

/** Scans persisted history only; the caller guards the fresh user separately. A flagged user row is dropped. A flagged assistant or tool row is neutralized in place: the sentences and tool-call strings holding a hit become `REPLAY_REDACTION_MARKER`, and an unsafe tool result becomes the same withheld stub a fresh `getNote` returns, so call/result pairs survive. A part that still fails a rescan is withheld whole, then the whole row; a row that fails even then is dropped with its orphaned tool partners. Every replayed row scans clean. */
export function sanitizeReplayHistory(messages: readonly AgentMessage[]): {
  messages: AgentMessage[];
  detections: ReplayDetection[];
} {
  const detections: ReplayDetection[] = [];
  const replayed: AgentMessage[] = [];
  for (const [index, message] of messages.entries()) {
    const detection = detectAiInput(projectReplayText(message));
    if (detection.safe) {
      replayed.push(message);
      continue;
    }
    const neutralized = neutralize(message);
    if (neutralized) {
      replayed.push(neutralized.message);
      detections.push({
        index,
        detection,
        disposition: neutralized.disposition,
        redactedSpans: neutralized.redactedSpans,
      });
    } else {
      detections.push({
        index,
        detection,
        disposition: 'block',
        redactedSpans: 0,
      });
    }
  }
  return { messages: repairTranscriptOrphans(replayed), detections };
}

/** Coalesces fitted history the way the provider receives it, then rescans every content-only assistant row: joining rows, flattening a tool turn to text, or repairing an orphaned call can bring together a hit no scanned row held. Such a row is redacted, or withheld whole as `REPLAY_REDACTION_MARKER`. User rows are left to the caller's seam guard. Each detection's `index` points into the returned messages. */
export function coalesceReplayHistory(messages: readonly AgentMessage[]): {
  messages: AgentMessage[];
  detections: ReplayDetection[];
} {
  const detections: ReplayDetection[] = [];
  const coalesced = coalesceMessages(messages).map((message, index) => {
    if (message.role !== 'assistant' || message.parts?.length) {
      return message;
    }
    const detection = detectAiInput(projectReplayText(message));
    if (detection.safe) {
      return message;
    }
    const text = neutralizeText(message.content);
    detections.push({
      index,
      detection,
      disposition: text.withheld ? 'withhold' : 'redact',
      redactedSpans: text.redactedSpans,
    });
    return { ...message, content: text.value };
  });
  return { messages: coalesced, detections };
}
