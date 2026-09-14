export { createBaseExtensions } from './extensions/base-extensions';
export { MarkdownPaste } from './extensions/markdown-paste';
export { CodeBlockView } from './extensions/code-block/CodeBlockView';
export { lowlight } from './extensions/code-block/lowlight-instance';
export { MermaidBlockView } from './extensions/mermaid-block/MermaidBlockView';
export { GhostText } from './extensions/ghost-text';
export type {
  GhostTextOptions,
  GhostTextProvider,
  GhostTextStreamInput,
  GhostTextStreamChunk,
} from './extensions/ghost-text';
export {
  AIBlockNode,
  AI_BLOCK_STATUS,
} from './extensions/ai-block/AIBlockNode';
export type {
  AIBlockOptions,
  AIBlockProvider,
  AIBlockStatus,
} from './extensions/ai-block/AIBlockNode';
export { SuggestionMenu } from './extensions/suggestion-menu';
export type { SuggestionMenuOptions } from './extensions/suggestion-menu';
export { ImageNode } from './extensions/image/ImageNode';
export type { ImageAttributes } from './extensions/image/ImageNode';
export {
  ImageUpload,
  extractImageFiles,
  ACCEPTED_IMAGE_TYPES,
} from './extensions/image/image-upload';
export type {
  ImageUploadProvider,
  ImageUploadOptions,
  UploadedImageResult,
} from './extensions/image/image-upload';

export { CollaborationIndicator } from './components/CollaborationIndicator';
export { CollaborativeCursors } from './components/CollaborativeCursors';
export { EditorErrorBoundary } from './components/EditorErrorBoundary';
export { EditorToolbar } from './components/EditorToolbar';
export { ReadOnlyEditor } from './components/ReadOnlyEditor';
export { DiffPreview } from './components/DiffPreview';
export type { DiffPreviewProps } from './components/DiffPreview';
export {
  SaveStatusIndicator,
  type SaveStatus,
} from './components/SaveStatusIndicator';
export { TableControls } from './components/TableControls';

export { shouldPropagateUpdate } from './shouldPropagateUpdate';

export { diffNoteHtml } from './diff/diff-note-html';
export type { DocChange, DocDiff } from './diff/diff-note-html';
export {
  CHANGE_ATTR,
  CHIP_ATTR,
  DIFF_DEL_CLASS,
  DIFF_INS_CLASS,
  ProposalDiff,
} from './extensions/proposal-diff';
export type {
  ProposalDiffLabels,
  ProposalDiffView,
} from './extensions/proposal-diff';
