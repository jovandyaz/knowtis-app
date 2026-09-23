import { createAiHtmlPurifier } from '@knowtis/editor';
import {
  AI_HTML_FORBID_ATTR,
  AI_HTML_FORBID_TAGS,
  isStoredImageUrl,
} from '@knowtis/shared-util';

const IMAGE_TAG = 'img';
const FIGURE_TAG = 'figure';
const SRC_ATTRIBUTE = 'src';
const IMAGE_ATTRIBUTES = new Set([SRC_ATTRIBUTE, 'alt', 'width', 'height']);
const PROPOSAL_FORBID_TAGS = AI_HTML_FORBID_TAGS.filter(
  (tag) => tag !== IMAGE_TAG
);

function isStoredImage(img: Element): boolean {
  return isStoredImageUrl(img.getAttribute(SRC_ATTRIBUTE) ?? '');
}

function isForeignImageMarkup(element: Element, tagName: string): boolean {
  if (tagName === FIGURE_TAG) {
    return ![...element.querySelectorAll(IMAGE_TAG)].some(isStoredImage);
  }
  return tagName === IMAGE_TAG && !isStoredImage(element);
}

const aiPurify = createAiHtmlPurifier();
const proposalPurify = createAiHtmlPurifier();

proposalPurify.addHook('uponSanitizeElement', (node, { tagName }) => {
  if (node instanceof Element && isForeignImageMarkup(node, tagName)) {
    node.remove();
  }
});

proposalPurify.addHook('uponSanitizeAttribute', (node, event) => {
  if (
    node.nodeName.toLowerCase() === IMAGE_TAG &&
    !IMAGE_ATTRIBUTES.has(event.attrName)
  ) {
    event.keepAttr = false;
  }
});

/**
 * Sanitizes LLM-produced HTML before it is rendered, whether injected as raw
 * HTML or parsed into the editor's ProseMirror schema. Beyond DOMPurify
 * defaults, strips every element/attribute that auto-fires a network request
 * (img/media/CSS url()) — assistant output is injectable via shared-note
 * content, so a remote fetch is an exfiltration channel.
 */
export function sanitizeAiHtml(html: string): string {
  return aiPurify.sanitize(html, {
    FORBID_TAGS: AI_HTML_FORBID_TAGS,
    FORBID_ATTR: AI_HTML_FORBID_ATTR,
  });
}

/**
 * {@link sanitizeAiHtml} for a copilot proposal, except that it keeps an image
 * the app stored (`isStoredImageUrl`) and drops any other with its figure,
 * as the server does, so the review shows exactly the images approval writes.
 */
export function sanitizeProposalHtml(html: string): string {
  return proposalPurify.sanitize(html, {
    FORBID_TAGS: PROPOSAL_FORBID_TAGS,
    FORBID_ATTR: AI_HTML_FORBID_ATTR,
  });
}
