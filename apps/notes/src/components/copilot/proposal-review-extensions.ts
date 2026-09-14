import { AIBlockNode, createBaseExtensions, ImageNode } from '@knowtis/editor';

/**
 * The server stores approved content through the semantic schema only, so
 * diffing with image/AI-block nodes present shows a rewrite that drops them.
 */
export const REVIEW_EXTENSIONS = [
  ...createBaseExtensions({ openLinksOnClick: true }),
  ImageNode,
  AIBlockNode,
];
