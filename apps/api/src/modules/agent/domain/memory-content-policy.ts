import { detectPromptInjection } from '@jovandyaz/llm-router';

import { MEMORY_MAX_CHARS } from '@knowtis/shared-types';

const NOTE_ACTIONS_EN =
  'share|send|forward|publish|append|add|edit|change|update|rewrite|replace|delete|remove|create|write';
const NOTE_ACTIONS_ES =
  'compart(?:e|ir)|env[ií]ar?|reenv[ií]ar?|publicar?|agregar?|a[nñ]ad(?:e|ir)|editar?|cambiar?|actualizar?|reescrib(?:e|ir)|reemplazar?|borrar?|eliminar?|crear?|escrib(?:e|ir)';
const CONDITION_OPENERS =
  'when|whenever|if|every time|each time|once|after|cuando|si|siempre que|cada vez que';

const CLAUSE_START = '(?:^|[.;!?]\\s*)\\s*';
const NOTE_TARGET = '(?:\\s+(?:it|them)\\b|[^.;]*\\b(?:notes?|notas?)\\b)';

const NOTE_INSTRUCTION_PATTERNS: readonly RegExp[] = [
  new RegExp(
    `${CLAUSE_START}(?:${CONDITION_OPENERS})\\b[^.;]*?(?:[,:]|\\bthen\\b|\\bentonces\\b)\\s*(?:please\\s+|por favor\\s+)?(?:${NOTE_ACTIONS_EN}|${NOTE_ACTIONS_ES})\\b${NOTE_TARGET}`,
    'i'
  ),
  new RegExp(
    `${CLAUSE_START}(?:(?:always|please)\\s+)*(?:${NOTE_ACTIONS_EN})\\b${NOTE_TARGET}`,
    'i'
  ),
  new RegExp(
    `\\b(?:you|the (?:assistant|copilot)|knowtis)\\s+(?:must|should|shall|have to|need to|to|will)\\s+(?:always\\s+)?(?:${NOTE_ACTIONS_EN})\\b${NOTE_TARGET}`,
    'i'
  ),
  new RegExp(
    `\\b(?:debes|tienes que|siempre)\\s+(?:${NOTE_ACTIONS_ES})\\b${NOTE_TARGET}`,
    'i'
  ),
  new RegExp(
    '\\b(?:authori[sz]\\w*|allows?|permits?|consents?|approves?|grants?|autoriza\\w*|permite\\w*|aprueba\\w*|concede\\w*)\\b[^.;]*\\b(?:shar\\w*|send\\w*|forward\\w*|edit\\w*|delet\\w*|compart\\w*|env[ií]\\w*|borr\\w*)\\b[^.;]*\\b(?:notes?|notas?)\\b',
    'iu'
  ),
];

const UNSTORABLE_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z\d+.-]*:\/\//i,
  /\bwww\./i,
  /\bdata:[a-z]+\/[\w.+-]+[;,]/i,
  /\b(?:javascript|vbscript):/i,
  /[\p{L}\p{N}._%+-]+@(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}/u,
  /\]\(/,
  /\]\[/,
  /^\s*\[[^\]]+\]:/m,
  /<\/?[a-z][^>]*>/i,
  /<!--/,
  /```|~~~/,
  /[\p{Cc}\p{Zl}\p{Zp}\u{E0100}-\u{E01EF}]/u,
  /[\uFE00-\uFE0F]{2,}/u,
  /(?:^|\s)[\uFE00-\uFE0F]/u,
  /(?!\u200D)\p{Cf}/u,
];

const NORMAL_FORM = 'NFKC';

function instructsNoteAction(form: string): boolean {
  return NOTE_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(form));
}

/**
 * Whether a candidate memory may be stored: a short plain-text fact with no URL, email address, link
 * or image syntax, HTML, code fence, control, separator, supplementary variation-selector or invisible
 * formatting character (the zero-width joiner of emoji sequences aside), a variation selector that
 * does not follow a base character on its own, or instruction to act on notes, checked as written and
 * in NFKC form so fullwidth look-alikes count. A memory is replayed into every later prompt, so
 * anything a renderer could turn into a request, a model into structure, or a later share or send into
 * a recipient never persists.
 */
export function isStorableMemory(content: string): boolean {
  return (
    content.trim().length > 0 &&
    content.length <= MEMORY_MAX_CHARS &&
    [content, content.normalize(NORMAL_FORM)].every(
      (form) =>
        !UNSTORABLE_PATTERNS.some((pattern) => pattern.test(form)) &&
        !instructsNoteAction(form)
    )
  );
}

/** Whether a stored memory may reach a prompt: it passes the content policy and the injection heuristic, which memories stored before either existed may not. */
export function isRecallableMemory(content: string): boolean {
  return isStorableMemory(content) && detectPromptInjection(content).safe;
}
