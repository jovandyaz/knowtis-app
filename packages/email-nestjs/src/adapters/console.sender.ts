import { Logger } from '@nestjs/common';
import { ok, type Result } from 'neverthrow';

import type {
  EmailSender,
  EmailSendError,
  SendEmailOptions,
} from '../ports/email-sender.port';

/**
 * Environments a developer runs locally. Anything not on this list — a staging
 * box, a preview deploy, an environment invented after this line was written —
 * is treated as deployed and never sees the body.
 */
const BODY_LOGGING_ENVIRONMENTS: readonly string[] = ['development', 'test'];
const MAX_CODE_POINT = 0x10ffff;

const SCRIPT_OR_STYLE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const LINE_BREAK_TAG = /<(?:br\s*\/?|\/(?:p|div|li|tr|td|title|h[1-6]))\s*>/gi;
const ANCHOR = /<a\b[^>]*\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
const REMAINING_TAG = /<[^>]*>/g;
const NAMED_ENTITY = /&(nbsp|amp|lt|gt|quot|apos);/gi;
const NAMED_ENTITY_TEXT: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};
const NUMERIC_ENTITY = /&#(x[\da-f]+|\d+);/gi;
const ZERO_WIDTH_CHAR = /[\u00AD\u200B-\u200F\uFEFF]/g;
const HORIZONTAL_WHITESPACE = /[^\S\n]+/g;
const BLANK_LINES = /\s*\n\s*\n?/g;

function decodeNumericEntity(_entity: string, code: string): string {
  const isHex = code[0]?.toLowerCase() === 'x';
  const value = Number.parseInt(isHex ? code.slice(1) : code, isHex ? 16 : 10);
  return Number.isNaN(value) || value > MAX_CODE_POINT
    ? ''
    : String.fromCodePoint(value);
}

function toPlainText(html: string): string {
  return html
    .replace(SCRIPT_OR_STYLE_BLOCK, '')
    .replace(LINE_BREAK_TAG, '\n')
    .replace(
      ANCHOR,
      (_anchor, href: string, label: string) => `${label} (${href})`
    )
    .replace(REMAINING_TAG, '')
    .replace(
      NAMED_ENTITY,
      (entity, name: string) => NAMED_ENTITY_TEXT[name.toLowerCase()] ?? entity
    )
    .replace(NUMERIC_ENTITY, decodeNumericEntity)
    .replace(ZERO_WIDTH_CHAR, '')
    .replace(HORIZONTAL_WHITESPACE, ' ')
    .replace(BLANK_LINES, '\n')
    .trim();
}

/** Development stand-in for a real provider: the message is only ever logged. */
export class ConsoleSender implements EmailSender {
  private readonly logger = new Logger(ConsoleSender.name);

  constructor(private readonly environment: string) {}

  async send(options: SendEmailOptions): Promise<Result<void, EmailSendError>> {
    this.logger.log(`[EMAIL] To: ${options.to}`);
    this.logger.log(`[EMAIL] Subject: ${options.subject}`);
    this.logger.log(`[EMAIL] From: ${options.from ?? 'default'}`);
    // The body carries one-time codes and reset links: readable on a developer's
    // machine so the flow can be finished, never in a deployed environment's logs.
    if (BODY_LOGGING_ENVIRONMENTS.includes(this.environment)) {
      this.logger.debug(`[EMAIL] Body:\n${toPlainText(options.html)}`);
    } else {
      this.logger.debug(`[EMAIL] HTML length: ${options.html.length} chars`);
    }
    return ok(undefined);
  }
}
