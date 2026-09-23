import type mermaidType from 'mermaid';

import { stripResourceLoads } from './stripResourceLoads';

export const MERMAID_THEME = {
  LIGHT: 'neutral',
  DARK: 'dark',
} as const;

export type MermaidTheme = (typeof MERMAID_THEME)[keyof typeof MERMAID_THEME];

// mermaid measures labels by attaching them to the live document, so anything
// a label loads is fetched before render() returns: its own label sanitizer is
// the only hook that runs early enough. Labels are HTML plus MathML (KaTeX)
const LABEL_SANITIZER_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true },
  FORBID_TAGS: ['style', 'img'],
  FORBID_ATTR: ['style', 'src', 'srcset', 'poster', 'background'],
};

// a diagram's front matter or %%{init}%% directive may set any config key not
// listed as secure (at any depth, mermaid's own defaults included), and each of
// these reaches the css, fill or stroke of the drawing mermaid measures in the
// live document. `c4` goes whole: every shape colour lands in a fill or stroke
const STYLE_CONFIG_KEYS = [
  'themeCSS',
  'themeVariables',
  'fontFamily',
  'altFontFamily',
  'c4',
  'titleColor',
  'linkColor',
  'width',
  'useWidth',
  'leftMargin',
  'chartWidth',
  'marginLeft',
  'marginRight',
];

let mermaidInstance: typeof mermaidType | null = null;
let appliedTheme: MermaidTheme | null = null;

async function getMermaid(theme: MermaidTheme) {
  if (!mermaidInstance) {
    const { default: mermaid } = await import('mermaid');
    mermaidInstance = mermaid;
  }
  if (appliedTheme !== theme) {
    // stripResourceLoads only removes fetches: strict is what keeps scripts
    // out of the injected svg, since mermaid then DOMPurifies its own output
    mermaidInstance.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      dompurifyConfig: LABEL_SANITIZER_CONFIG,
      secure: STYLE_CONFIG_KEYS,
      theme,
    });
    appliedTheme = theme;
  }
  return mermaidInstance;
}

export async function renderMermaid(
  id: string,
  source: string,
  theme: MermaidTheme
): Promise<string> {
  const mermaid = await getMermaid(theme);
  const { svg } = await mermaid.render(id, source);
  return stripResourceLoads(svg);
}
