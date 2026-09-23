import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { MERMAID_THEME, renderMermaid } from './renderMermaid';

const ATTACKER = 'x.invalid';

const LABEL_VECTORS: Record<string, string> = {
  'an <img>': `flowchart TD\n  A["<img src=https://${ATTACKER}/a.png>"] --> B`,
  'a css background': `flowchart TD\n  A["<span style='background-image:url(https://${ATTACKER}/b.png)'>x</span>"] --> B`,
  'an svg <image>': `flowchart TD\n  A["<svg><image href=https://${ATTACKER}/c.png /></svg>"] --> B`,
  'an feImage': `flowchart TD\n  A["<svg><filter id=f><feImage href=https://${ATTACKER}/d.png /></filter></svg>"] --> B`,
  'an external <use>': `flowchart TD\n  A["<svg><use href=https://${ATTACKER}/e.svg#a /></svg>"] --> B`,
  'an svg paint server url': `flowchart TD\n  A["<svg><rect filter='url(https://${ATTACKER}/f.svg#x)' /></svg>"] --> B`,
  'html media and legacy loaders': `flowchart TD\n  A["<picture><source srcset=https://${ATTACKER}/g.png></picture><video poster=https://${ATTACKER}/h.png></video><input type=image src=https://${ATTACKER}/i.png><table background=https://${ATTACKER}/j.png><tr><td>x</td></tr></table>"] --> B`,
  'a mathml glyph': `flowchart TD\n  A["<math><mglyph src=https://${ATTACKER}/k.png></mglyph></math>"] --> B`,
  'a <style> element': `flowchart TD\n  A["x<style>@import url(https://${ATTACKER}/l.css);</style>"] --> B`,
  'an edge label <img>': `flowchart TD\n  A -- "<img src=https://${ATTACKER}/m.png>" --> B`,
  'a class name <img>': `classDiagram\n  class A["<img src=https://${ATTACKER}/n.png>"]`,
  'a kanban card <img>': `kanban\n  todo[Todo]\n    t1["<img src=https://${ATTACKER}/o.png>"]`,
  'a markdown image': `flowchart TD\n  A["\`![x](https://${ATTACKER}/x.png)\`"] --> B`,
};

const OUTSIDE_LABEL_VECTORS: Record<string, string> = {
  'a themeCSS directive': `%%{init: {"themeCSS": "div { background-image: url(https://${ATTACKER}/p.png) }"}}%%\nflowchart TD\n  A --> B`,
  'a themeCSS front matter key': `---\nconfig:\n  themeCSS: "div { background-image: url(https://${ATTACKER}/r.png) }"\n---\nflowchart TD\n  A --> B`,
  'a fontFamily directive': `%%{init: {"fontFamily": "x; background-image: url(https://${ATTACKER}/s.png)"}}%%\nflowchart TD\n  A --> B`,
  'a state classDef': `stateDiagram-v2\n  classDef bad background:url(https://${ATTACKER}/t.png)\n  [*] --> A\n  class A bad`,
  'a class diagram style': `classDiagram\n  class A\n  style A fill:url(https://${ATTACKER}/u.png)`,
  'a block diagram style': `block-beta\n  a b\n  style a fill:url(https://${ATTACKER}/v.png)`,
  'a style spelled with entity codes': `classDiagram\n  class A\n  style A background:url#40;https://${ATTACKER}/y.png#41;`,
  'a flowchart image shape': `flowchart TD\n  A@{ img: "https://${ATTACKER}/w.png", label: "L", pos: "t", h: 60, constraint: "on" }`,
};

function parse(svg: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = svg;
  return template.content;
}

function attackerReferences(elements: Iterable<Element>): string[] {
  return [...elements].flatMap((element) => [
    ...[...element.attributes]
      .filter((attr) => attr.value.includes(ATTACKER))
      .map((attr) => `${element.localName}[${attr.name}]`),
    ...(element.localName === 'style' && element.textContent?.includes(ATTACKER)
      ? ['style']
      : []),
  ]);
}

function referencesIn(svg: string): string[] {
  return attackerReferences(parse(svg).querySelectorAll('*'));
}

async function renderObservingDocument(id: string, source: string) {
  const attached: string[] = [];
  const collect = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          attached.push(
            ...attackerReferences([node, ...node.querySelectorAll('*')])
          );
        }
      }
      if (record.target instanceof Element && record.type === 'attributes') {
        attached.push(...attackerReferences([record.target]));
      }
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
  });
  try {
    const svg = await renderMermaid(id, source, MERMAID_THEME.LIGHT);
    return { svg, attached };
  } finally {
    collect(observer.takeRecords());
    observer.disconnect();
  }
}

describe('renderMermaid', () => {
  const imageComplete = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'complete'
  );

  // jsdom lays nothing out and never settles an image, and mermaid waits on
  // both while it draws
  beforeAll(() => {
    Object.assign(SVGElement.prototype, {
      getBBox: () => ({ x: 0, y: 0, width: 40, height: 20 }),
      getComputedTextLength: () => 40,
    });
    Object.assign(HTMLImageElement.prototype, {
      decode: () => Promise.resolve(),
    });
    Object.defineProperty(HTMLImageElement.prototype, 'complete', {
      configurable: true,
      get: () => true,
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
    Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
    if (imageComplete) {
      Object.defineProperty(
        HTMLImageElement.prototype,
        'complete',
        imageComplete
      );
    }
  });

  it.each(Object.entries(LABEL_VECTORS))(
    'never lets %s in a label reach the live document',
    async (_, source) => {
      const { svg, attached } = await renderObservingDocument('label', source);

      expect(attached).toEqual([]);
      expect(referencesIn(svg)).toEqual([]);
    }
  );

  it.each(Object.entries(OUTSIDE_LABEL_VECTORS))(
    'returns no resource load from %s',
    async (_, source) => {
      const svg = await renderMermaid('style', source, MERMAID_THEME.LIGHT);

      expect(referencesIn(svg)).toEqual([]);
    }
  );

  it('drops a stored-host image from a label too', async () => {
    const svg = await renderMermaid(
      'stored',
      `flowchart TD\n  A["<img src=https://${STORED_IMAGE_HOST}/n/a.png>"] --> B`,
      MERMAID_THEME.LIGHT
    );

    expect([...parse(svg).querySelectorAll('img')]).toEqual([]);
  });

  it('keeps the local references a flowchart draws its arrows and fills with', async () => {
    const svg = parse(
      await renderMermaid(
        'plain',
        'flowchart LR\n  A --> B',
        MERMAID_THEME.LIGHT
      )
    );

    expect(
      [...svg.querySelectorAll('[marker-end]')].map((path) =>
        path.getAttribute('marker-end')
      )
    ).toEqual(['url(#plain_flowchart-v2-pointEnd)']);
    expect(
      [...svg.querySelectorAll('style')].map((style) =>
        style.textContent?.includes('url(#plain-gradient)')
      )
    ).toEqual([true]);
  });
});
