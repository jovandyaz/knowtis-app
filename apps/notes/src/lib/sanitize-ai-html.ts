import { AI_HTML_PURIFY_CONFIG, createAiHtmlPurifier } from '@knowtis/editor';
import { IMAGE_FIGURE_ATTRIBUTE } from '@knowtis/editor-schema';
import { isStoredImageUrl } from '@knowtis/shared-util';

const IMAGE_TAG = 'img';
const FIGURE_TAG = 'figure';
const FIGCAPTION_TAG = 'figcaption';
const SRC_ATTRIBUTE = 'src';
const IMAGE_ATTRIBUTES = new Set([SRC_ATTRIBUTE, 'alt', 'width', 'height']);
const PROPOSAL_PURIFY_CONFIG = {
  ...AI_HTML_PURIFY_CONFIG,
  ALLOWED_TAGS: [
    ...AI_HTML_PURIFY_CONFIG.ALLOWED_TAGS,
    FIGURE_TAG,
    FIGCAPTION_TAG,
    IMAGE_TAG,
  ],
  ALLOWED_ATTR: [
    ...AI_HTML_PURIFY_CONFIG.ALLOWED_ATTR,
    IMAGE_FIGURE_ATTRIBUTE,
    ...IMAGE_ATTRIBUTES,
  ],
};

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
 * HTML or parsed into the editor's ProseMirror schema. Only what the note
 * schema reads survives (`AI_HTML_PURIFY_CONFIG`), images excluded: assistant
 * output is injectable via shared-note content, so anything that fetches on
 * render is an exfiltration channel.
 */
export function sanitizeAiHtml(html: string): string {
  return aiPurify.sanitize(html, AI_HTML_PURIFY_CONFIG);
}

/**
 * {@link sanitizeAiHtml} for a copilot proposal, except that it keeps an image
 * the app stored (`isStoredImageUrl`) and drops any other with its figure,
 * as the server does, so the review shows exactly the images approval writes.
 */
export function sanitizeProposalHtml(html: string): string {
  return proposalPurify.sanitize(html, PROPOSAL_PURIFY_CONFIG);
}
