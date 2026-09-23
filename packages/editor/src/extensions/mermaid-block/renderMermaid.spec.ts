import mermaid from 'mermaid';
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

const FLOWCHART = 'flowchart TD\n  A --> B';

function withDirective(config: object, source: string): string {
  return `%%{init: ${JSON.stringify(config)}}%%\n${source}`;
}

function cssInjection(key: string): string {
  return `0;background-image:url(https://${ATTACKER}/${key});x:`;
}

function paint(key: string): string {
  return `url(https://${ATTACKER}/${key}.svg#p)`;
}

const DIAGRAM_SAMPLES: Record<string, string> = {
  flowchart: FLOWCHART,
  sequence: 'sequenceDiagram\n  actor A\n  A->>B: hi\n  Note over A: n',
  gantt: 'gantt\n  dateFormat YYYY-MM-DD\n  section S\n  T :a1, 2024-01-01, 1d',
  journey: 'journey\n  title T\n  section S\n    A: 5: Me',
  timeline: 'timeline\n  title T\n  2020 : a',
  class: 'classDiagram\n  A <|-- B',
  state: 'stateDiagram-v2\n  [*] --> A',
  er: 'erDiagram\n  A ||--o{ B : has',
  pie: 'pie title P\n  "a": 1\n  "b": 2',
  quadrantChart: 'quadrantChart\n  title Q\n  A: [0.3, 0.6]',
  xyChart: 'xychart-beta\n  x-axis [a, b]\n  bar [1, 2]',
  requirement: 'requirementDiagram\n  requirement r {\n  id: 1\n  text: t\n  }',
  kanban: 'kanban\n  todo[Todo]\n    t1[Write]',
  gitGraph: 'gitGraph\n  commit\n  branch d\n  commit',
  c4: 'C4Context\n  Person(a, "A")\n  Person_Ext(e, "E")\n  System(b, "B")\n  SystemDb(d, "D")\n  SystemQueue(q, "Q")\n  System_Ext(x, "X")\n  Rel(a, b, "u")',
  sankey: 'sankey-beta\n  A,B,1',
  packet: 'packet-beta\n  0-7: "a"',
  block: 'block-beta\n  a b',
  radar: 'radar-beta\n  axis A, B, C\n  curve c{1,2,3}',
};

const CONFIG_VECTORS: Record<string, string> = {
  'a themeCSS directive': `%%{init: {"themeCSS": "div { background-image: url(https://${ATTACKER}/p.png) }"}}%%\n${FLOWCHART}`,
  'a themeCSS front matter key': `---\nconfig:\n  themeCSS: "div { background-image: url(https://${ATTACKER}/r.png) }"\n---\n${FLOWCHART}`,
  'a fontFamily directive': `%%{init: {"fontFamily": "x; background-image: url(https://${ATTACKER}/s.png)"}}%%\n${FLOWCHART}`,
  'a themeVariables directive': withDirective(
    { themeVariables: { lineColor: `url(${ATTACKER})` } },
    FLOWCHART
  ),
  'c4 shape colours': withDirective(
    {
      c4: {
        person_bg_color: paint('c4.bg'),
        person_border_color: paint('c4.border'),
      },
    },
    DIAGRAM_SAMPLES['c4'] ?? ''
  ),
  'a journey title colour and margin': withDirective(
    {
      journey: {
        titleColor: paint('journey.title'),
        leftMargin: cssInjection('journey.margin'),
      },
    },
    DIAGRAM_SAMPLES['journey'] ?? ''
  ),
  'a quadrant chart width': withDirective(
    { quadrantChart: { chartWidth: cssInjection('quadrant.width') } },
    DIAGRAM_SAMPLES['quadrantChart'] ?? ''
  ),
  'radar size and margins': withDirective(
    {
      radar: {
        width: cssInjection('radar.width'),
        marginLeft: cssInjection('radar.left'),
        marginRight: cssInjection('radar.right'),
      },
    },
    DIAGRAM_SAMPLES['radar'] ?? ''
  ),
  'a sankey link colour': withDirective(
    { sankey: { linkColor: paint('sankey.link') } },
    DIAGRAM_SAMPLES['sankey'] ?? ''
  ),
  'an xy chart width': withDirective(
    { xyChart: { width: cssInjection('xychart.width') } },
    DIAGRAM_SAMPLES['xyChart'] ?? ''
  ),
};

const SOURCE_STATEMENT_VECTORS: Record<string, string> = {
  'a state classDef': `stateDiagram-v2\n  classDef bad background:url(https://${ATTACKER}/t.png)\n  [*] --> A\n  class A bad`,
  'a class diagram style': `classDiagram\n  class A\n  style A fill:url(https://${ATTACKER}/u.png)`,
  'a block diagram style': `block-beta\n  a b\n  style a fill:url(https://${ATTACKER}/v.png)`,
  'a block diagram classDef': `block-beta\n  a b\n  classDef c fill:url(https://${ATTACKER}/z.png)\n  class a c`,
  'a c4 element and relation style': `C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "u")\n  UpdateElementStyle(a, $bgColor="${paint('c4e')}", $borderColor="${paint('c4b')}")\n  UpdateRelStyle(a, b, $lineColor="${paint('c4l')}", $textColor="${paint('c4t')}")`,
  'a style spelled with entity codes': `classDiagram\n  class A\n  style A background:url#40;https://${ATTACKER}/y.png#41;`,
  'a flowchart image shape': `flowchart TD\n  A@{ img: "https://${ATTACKER}/w.png", label: "L", pos: "t", h: 60, constraint: "on" }`,
};

const LOADING_SINKS = new Set([
  'style',
  'fill',
  'stroke',
  'filter',
  'mask',
  'clip-path',
  'marker-start',
  'marker-mid',
  'marker-end',
  'cursor',
  'href',
  'xlink:href',
  'src',
  'srcset',
  'background',
  'poster',
]);

function parse(svg: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = svg;
  return template.content;
}

function attackerReferences(
  elements: Iterable<Element>,
  sinks?: ReadonlySet<string>
): string[] {
  return [...elements].flatMap((element) => [
    ...[...element.attributes]
      .filter(
        (attr) =>
          attr.value.includes(ATTACKER) && (sinks?.has(attr.name) ?? true)
      )
      .map((attr) => `${element.localName}[${attr.name}]`),
    ...(element.localName === 'style' && element.textContent?.includes(ATTACKER)
      ? ['style']
      : []),
  ]);
}

function referencesIn(svg: string): string[] {
  return attackerReferences(parse(svg).querySelectorAll('*'));
}

async function attachedWhile(
  action: () => Promise<unknown>,
  sinks?: ReadonlySet<string>
): Promise<string[]> {
  const attached: string[] = [];
  const collect = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          attached.push(
            ...attackerReferences([node, ...node.querySelectorAll('*')], sinks)
          );
        }
      }
      if (record.target instanceof Element && record.type === 'attributes') {
        attached.push(...attackerReferences([record.target], sinks));
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
    await action();
  } finally {
    collect(observer.takeRecords());
    observer.disconnect();
  }
  return attached;
}

async function renderObservingDocument(id: string, source: string) {
  let svg = '';
  const attached = await attachedWhile(async () => {
    svg = await renderMermaid(id, source, MERMAID_THEME.LIGHT);
  });
  return { svg, attached };
}

function isScalar(value: unknown): value is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function settableConfigCases(): [object, string][] {
  const site: Record<string, unknown> = {
    ...mermaid.mermaidAPI.getSiteConfig(),
  };
  const topLevel = Object.entries(site)
    .filter(([, value]) => isScalar(value))
    .map(([key]): [object, string] => [
      { [key]: cssInjection(key) },
      FLOWCHART,
    ]);
  const perDiagram = Object.entries(DIAGRAM_SAMPLES).flatMap(
    ([diagram, sample]) =>
      Object.entries({ ...(site[diagram] as Record<string, unknown>) })
        .filter(([, value]) => isScalar(value))
        .map(([key]): [object, string] => [
          { [diagram]: { [key]: cssInjection(`${diagram}.${key}`) } },
          sample,
        ])
  );
  return [...topLevel, ...perDiagram];
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

  it.each(Object.entries(CONFIG_VECTORS))(
    'never lets %s reach the live document',
    async (_, source) => {
      const { svg, attached } = await renderObservingDocument('config', source);

      expect(attached).toEqual([]);
      expect(referencesIn(svg)).toEqual([]);
    }
  );

  it('lets no config key a diagram sets carry a resource load into the live document', async () => {
    await renderMermaid('warm', FLOWCHART, MERMAID_THEME.LIGHT);
    const leaks: string[] = [];

    for (const [config, sample] of settableConfigCases()) {
      leaks.push(
        ...(await attachedWhile(
          () =>
            renderMermaid(
              'drift',
              withDirective(config, sample),
              MERMAID_THEME.LIGHT
            ).catch(() => undefined),
          LOADING_SINKS
        ))
      );
    }

    expect(leaks).toEqual([]);
  }, 60_000);

  it.each(Object.entries(SOURCE_STATEMENT_VECTORS))(
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
