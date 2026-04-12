export const MERMAID_VIEW_MODE = {
  CODE: 'code',
  PREVIEW: 'preview',
  SPLIT: 'split',
} as const;

export type MermaidViewMode =
  (typeof MERMAID_VIEW_MODE)[keyof typeof MERMAID_VIEW_MODE];
