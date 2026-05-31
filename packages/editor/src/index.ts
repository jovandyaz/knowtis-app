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
export { SlashCommands } from './extensions/slash-commands';
export type { SlashCommandsOptions } from './extensions/slash-commands';
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
export {
  SaveStatusIndicator,
  type SaveStatus,
} from './components/SaveStatusIndicator';
export { TableControls } from './components/TableControls';

export { shouldPropagateUpdate } from './shouldPropagateUpdate';
