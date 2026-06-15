import { createHash } from 'node:crypto';

import { htmlToPlainText } from '../sanitize/html-sanitizer';

const MAX_CHARS = 28_000;

export function buildEmbeddingText(title: string, contentHtml: string): string {
  const plain = htmlToPlainText(contentHtml);
  return `${title}\n\n${plain}`.slice(0, MAX_CHARS);
}

export function embeddingInputHash(
  title: string,
  contentHtml: string,
  model: string
): string {
  return createHash('sha256')
    .update(`${model} ${buildEmbeddingText(title, contentHtml)}`)
    .digest('hex');
}
