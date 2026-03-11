declare module '@tiptap/html/server' {
  import type { Extensions } from '@tiptap/core';
  import type { ParseOptions } from '@tiptap/pm/model';

  export function generateHTML(
    doc: Record<string, unknown>,
    extensions: Extensions
  ): string;

  export function generateJSON(
    html: string,
    extensions: Extensions,
    options?: ParseOptions
  ): Record<string, unknown>;
}
