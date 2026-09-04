import type MarkdownIt from 'markdown-it';

const MERMAID_LANGUAGE = 'mermaid';

export const MERMAID_BLOCK_ATTR = 'data-mermaid-block';
export const MERMAID_CODE_ATTR = 'data-code';

/**
 * markdown-it plugin: renders a ```mermaid fence as the `<div data-mermaid-block data-code="...">`
 * element the mermaidBlock node parses, leaving every other fence to the default renderer.
 */
export function mermaidFence(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];

    if (token.info.trim() === MERMAID_LANGUAGE) {
      const code = md.utils.escapeHtml(token.content);
      return `<div ${MERMAID_BLOCK_ATTR} ${MERMAID_CODE_ATTR}="${code}"></div>`;
    }

    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
}
