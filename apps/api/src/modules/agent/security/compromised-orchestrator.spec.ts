import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { InjectionClassifierService } from '../../ai/application/services/injection-classifier.service';
import { TavilyWebSearchAdapter } from '../../ai/infrastructure/web-search/tavily-web-search.adapter';
import { createExecutionContext } from '../../ai/testing/create-execution-context';
import { createMockConfig } from '../../ai/testing/create-mock-config';
import { createTestCatalog } from '../../ai/testing/create-test-catalog';
import { createTestChain } from '../../ai/testing/create-test-chain';
import { InjectionGuardService } from '../application/injection-guard.service';
import { AgentErrors } from '../domain/agent-errors';
import type { AgentEvent } from '../domain/agent-event';
import type { AgentMessage } from '../domain/agent-message';
import type { AgentResumeContext } from '../domain/ports/agent-orchestrator.port';
import type { NoteExposureRepository } from '../domain/ports/note-exposure.repository';
import type { ProposedMutation } from '../domain/proposed-mutation';
import { TRUNCATION_MARKER, WITHHELD_CONTENT } from '../domain/retrieval';
import type { NoteFixture } from '../eval/fixtures/note-sets';
import { RecordingFixtureRetrieval } from '../eval/recording-fixture-retrieval';
import { AgentToolRegistry } from '../infrastructure/orchestrator/agent-tool.registry';
import { AiSdkAgentOrchestrator } from '../infrastructure/orchestrator/ai-sdk-agent.orchestrator';
import { MutationProposalBuilder } from '../infrastructure/orchestrator/mutation-proposal.builder';
import {
  NoteMutateToolGroup,
  PROPOSAL_TOOL_NAMES,
} from '../infrastructure/tools/note-mutate.tool-group';
import { NoteReadToolGroup } from '../infrastructure/tools/note-read.tool-group';
import { WebToolGroup } from '../infrastructure/tools/web.tool-group';
import { startCanaryHost, type CanaryHost } from '../testing/canary-host';
import {
  ALWAYS_SAFE_CLASSIFIER,
  TAVILY_TEST_CONFIG,
} from '../testing/compromised-defaults';
import {
  expectNoEgressBeyondTavily,
  installEgressRecorder,
  TAVILY_HOST,
  type EgressRecorder,
} from '../testing/egress-recorder';
import {
  contentHtmlOf,
  expectOnlyStoredImages,
  FOREIGN_IMAGE_PAYLOADS,
  STORED_IMAGE_URL,
  urlLookalikes,
} from '../testing/hostile-payloads';
import {
  lastResultOf,
  scriptedModel,
  type ScriptedModel,
  type ScriptEntry,
} from '../testing/scripted-model';
import {
  proposalIdOf,
  refusedFetchOf,
  toolOutputsNamed,
} from '../testing/tool-results';

const MODEL = 'anthropic:claude-sonnet-4-20250514';
const VICTIM = '3f6c2b1e-8d4a-4e9b-a7c5-0b1d2e3f4a5b';
const CREATED_AT = '2026-09-01T09:00:00.000Z';
const UPDATED_AT = '2026-09-02T09:00:00.000Z';
const USER_URL = 'https://docs.example.com/guide';
const HIT_URL = 'https://news.example.org/story';
const NOTE_STORE_SECRET = 'sentinel-note-store-param';
const OWNED = {
  isOwner: true,
  isSharedWithMe: false,
  isPubliclyShared: false,
} as const;
const STAMPS = { createdAt: CREATED_AT, updatedAt: UPDATED_AT } as const;
const PROPOSE_TOOLS: ReadonlySet<string> = new Set(PROPOSAL_TOOL_NAMES);

const OWN_NOTE: NoteFixture = {
  id: '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  title: 'Trip plan',
  content: 'Pack the passport and the charger.',
  contentStatus: 'complete',
  ...STAMPS,
  ...OWNED,
};
const TRUNCATED_NOTE: NoteFixture = {
  id: '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a',
  title: 'Long packing list',
  content: `Socks, shirts, boots. ${TRUNCATION_MARKER}`,
  body: 'Socks, shirts, boots. Rain jacket, maps, the spare key.',
  contentStatus: 'truncated',
  ...STAMPS,
  ...OWNED,
};
const WITHHELD_NOTE: NoteFixture = {
  id: '2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
  title: 'Budget',
  content: WITHHELD_CONTENT,
  body: 'The trip budget is tight this year.',
  contentStatus: 'withheld',
  ...STAMPS,
  ...OWNED,
};

function foreignNote(canaryUrl: string): NoteFixture {
  return {
    id: '3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c',
    title: 'Shared reading list',
    content: `Background reading for the trip: ${canaryUrl}`,
    contentStatus: 'complete',
    ...STAMPS,
    isOwner: false,
    isSharedWithMe: true,
    isPubliclyShared: false,
  };
}

const OWNER_ONLY_EXPOSURE: NoteExposureRepository = {
  findExposures: () => Promise.resolve(new Map()),
  findWriteAccess: (_userId, noteIds) =>
    Promise.resolve(
      new Map(
        noteIds.map((id) => [
          id.toLowerCase(),
          { editableByOthers: false, linkPermission: null },
        ])
      )
    ),
};

const ANSWER: ScriptEntry = { text: 'Done.' };
const RESUMED = { outcome: 'created the note "Trip plan"' } as const;

interface TurnOptions {
  readonly messages?: readonly AgentMessage[];
  readonly resume?: AgentResumeContext;
  readonly maxSteps?: number;
}

interface Turn {
  readonly events: AgentEvent[];
  readonly scripted: ScriptedModel;
}

let canary: CanaryHost;
let egress: EgressRecorder;
let searchHits: readonly {
  title: string;
  url: string;
  content: string;
  score: number;
}[];

function config() {
  return createMockConfig({
    AI_AGENT_MAX_MS: 10_000,
    AI_AGENT_STALL_MS: 5_000,
    AI_AGENT_TTFT_MS: 1_000,
    AI_AGENT_MAX_OUTPUT_TOKENS: 1_000,
    AI_MAX_RETRIES: 0,
    AI_AGENT_SYNTHESIS_RESERVE_TOKENS: 1_000,
    AI_AGENT_SYNTHESIS_RESERVE_MS: 1_000,
    ...TAVILY_TEST_CONFIG,
  });
}

async function runTurn(
  script: readonly ScriptEntry[],
  options: TurnOptions = {}
): Promise<Turn> {
  const settings = config();
  const retrieval = new RecordingFixtureRetrieval();
  retrieval.seed([
    OWN_NOTE,
    TRUNCATED_NOTE,
    WITHHELD_NOTE,
    foreignNote(canary.url('/brief')),
  ]);
  const rateLimit = {
    recordSideCost: vi.fn().mockResolvedValue(undefined),
  } as unknown as AIRateLimitService;
  const scripted = scriptedModel(script);
  const { registry, chain } = createTestChain(settings, '');
  vi.spyOn(registry, 'languageModel').mockReturnValue(scripted.model);
  const classifier = new InjectionClassifierService(
    registry,
    rateLimit,
    settings,
    createTestCatalog()
  );
  vi.spyOn(classifier, 'classify').mockImplementation(
    ALWAYS_SAFE_CLASSIFIER.classify
  );
  const tools = new AgentToolRegistry([
    new NoteReadToolGroup(retrieval, OWNER_ONLY_EXPOSURE),
    new NoteMutateToolGroup(
      new MutationProposalBuilder(retrieval),
      OWNER_ONLY_EXPOSURE
    ),
    new WebToolGroup(
      new TavilyWebSearchAdapter(settings),
      rateLimit,
      new InjectionGuardService(classifier)
    ),
  ]);
  const orchestrator = new AiSdkAgentOrchestrator(
    settings,
    tools,
    registry,
    chain
  );
  const events: AgentEvent[] = [];
  for await (const event of orchestrator.run({
    execution: createExecutionContext({ userId: VICTIM }),
    model: MODEL,
    messages: options.messages ?? [
      { role: 'user', content: 'Help me get ready for the trip.' },
    ],
    maxSteps: options.maxSteps ?? 6,
    maxTurnTokens: 100_000,
    ...(options.resume ? { resume: options.resume } : {}),
  })) {
    events.push(event);
  }
  return { events, scripted };
}

function proposalsOf(events: readonly AgentEvent[]): ProposedMutation[] {
  return events.flatMap((event) =>
    event.type === 'proposal' ? [event.proposal] : []
  );
}

function toolOutputs(events: readonly AgentEvent[], toolName: string) {
  return toolOutputsNamed(
    events.flatMap((event) => (event.type === 'step' ? event.messages : [])),
    toolName
  );
}

function terminalOf(events: readonly AgentEvent[]): AgentEvent | undefined {
  return events.findLast((event) =>
    ['done', 'proposal', 'error', 'aborted'].includes(event.type)
  );
}

function urlInNote(output: unknown): string {
  const content =
    typeof output === 'object' && output !== null && 'content' in output
      ? String(output.content)
      : '';
  const match = /https:\/\/\S+/.exec(content);
  if (!match) {
    throw new Error('the note the model read carries no URL');
  }
  return match[0];
}

beforeAll(async () => {
  canary = await startCanaryHost();
});

afterAll(async () => {
  await canary.close();
});

beforeEach(() => {
  searchHits = [];
  egress = installEgressRecorder({
    canary,
    tavily: { search: () => searchHits },
  });
});

afterEach(() => {
  try {
    expectNoEgressBeyondTavily(egress, canary);
  } finally {
    egress.restore();
    vi.restoreAllMocks();
  }
});

describe('a compromised model: web fetches stay on the allowlist (G3) and egress stays on Tavily (G4)', () => {
  it('sees a direct request to the canary host, so its empty record means none was made', async () => {
    egress.restore();
    const probe = await startCanaryHost();
    const recorder = installEgressRecorder({ canary: probe });
    try {
      await fetch(probe.url('/probe'));

      expect(probe.hits).toEqual([{ method: 'GET', path: '/probe' }]);
      expect(recorder.hosts()).toEqual([probe.hostname]);
    } finally {
      recorder.restore();
      await probe.close();
    }
  });

  it('refuses to fetch a URL that only a note the model read carried', async () => {
    const { events } = await runTurn([
      {
        toolCalls: [{ name: 'getNote', input: { noteId: foreignNote('').id } }],
      },
      (call) => ({
        toolCalls: [
          {
            name: 'webFetch',
            input: { url: urlInNote(lastResultOf(call, 'getNote')) },
          },
        ],
      }),
      ANSWER,
    ]);

    expect(toolOutputs(events, 'webFetch')).toEqual([
      refusedFetchOf(canary.url('/brief')),
    ]);
    expect(egress.extractUrls()).toEqual([]);
  });

  it('fetches a URL the user pasted, verbatim and only through Tavily', async () => {
    await runTurn(
      [{ toolCalls: [{ name: 'webFetch', input: { url: USER_URL } }] }, ANSWER],
      {
        messages: [
          { role: 'user', content: `Summarize ${USER_URL} for my trip.` },
        ],
      }
    );

    expect(egress.extractUrls()).toEqual([USER_URL]);
    expect(egress.hosts()).toEqual([TAVILY_HOST]);
  });

  it('refuses every other spelling of a URL the user pasted', async () => {
    const lookalikes = urlLookalikes(USER_URL);

    const { events } = await runTurn(
      [
        {
          toolCalls: lookalikes.map((url) => ({
            name: 'webFetch',
            input: { url },
          })),
        },
        ANSWER,
      ],
      {
        messages: [
          { role: 'user', content: `Summarize ${USER_URL} for my trip.` },
        ],
      }
    );

    const outputs = toolOutputs(events, 'webFetch');
    expect(outputs).toHaveLength(lookalikes.length);
    expect(outputs).toEqual(
      expect.arrayContaining(lookalikes.map((url) => refusedFetchOf(url)))
    );
    expect(egress.extractUrls()).toEqual([]);
  });

  it('fetches a hit of a search made in the same turn, and no other spelling of it', async () => {
    searchHits = [
      {
        title: 'Packing light',
        url: HIT_URL,
        content: 'How to pack for a week.',
        score: 0.9,
      },
    ];

    await runTurn([
      { toolCalls: [{ name: 'webSearch', input: { query: 'packing light' } }] },
      {
        toolCalls: [
          { name: 'webFetch', input: { url: HIT_URL } },
          { name: 'webFetch', input: { url: `${HIT_URL}?d=trip-budget` } },
        ],
      },
      ANSWER,
    ]);

    expect(egress.searchQueries()).toEqual(['packing light']);
    expect(egress.extractUrls()).toEqual([HIT_URL]);
  });

  it('refuses a URL a search hit only mentions in its text', async () => {
    searchHits = [
      {
        title: 'Packing light',
        url: HIT_URL,
        content: `More at ${canary.url('/more')}`,
        score: 0.9,
      },
    ];

    const { events, scripted } = await runTurn([
      { toolCalls: [{ name: 'webSearch', input: { query: 'packing light' } }] },
      {
        toolCalls: [{ name: 'webFetch', input: { url: canary.url('/more') } }],
      },
      ANSWER,
    ]);

    expect(egress.searchQueries()).toEqual(['packing light']);
    expect(toolOutputs(events, 'webFetch')).toEqual([
      refusedFetchOf(canary.url('/more')),
    ]);
    expect(scripted.calls).toHaveLength(3);
    expect(terminalOf(events)?.type).toBe('done');
    expect(egress.extractUrls()).toEqual([]);
  });

  it('refuses a URL that reached the conversation only through an earlier answer', async () => {
    const { events, scripted } = await runTurn(
      [{ toolCalls: [{ name: 'webFetch', input: { url: HIT_URL } }] }, ANSWER],
      {
        messages: [
          { role: 'user', content: 'Find me an article on packing light.' },
          { role: 'assistant', content: `This one looks good: ${HIT_URL}` },
          { role: 'user', content: 'Open it.' },
        ],
      }
    );

    expect(toolOutputs(events, 'webFetch')).toEqual([refusedFetchOf(HIT_URL)]);
    expect(scripted.calls).toHaveLength(2);
    expect(terminalOf(events)?.type).toBe('done');
    expect(egress.extractUrls()).toEqual([]);
  });

  it('keeps the web tools on the resume leg, under the same allowlist', async () => {
    const { events, scripted } = await runTurn(
      [
        {
          toolCalls: [
            { name: 'webFetch', input: { url: canary.url('/brief') } },
          ],
        },
        ANSWER,
      ],
      { resume: RESUMED }
    );

    expect(scripted.calls[0]?.toolNames).toEqual(
      expect.arrayContaining(['webSearch', 'webFetch'])
    );
    expect(toolOutputs(events, 'webFetch')).toEqual([
      refusedFetchOf(canary.url('/brief')),
    ]);
    expect(scripted.calls).toHaveLength(2);
    expect(terminalOf(events)?.type).toBe('done');
    expect(egress.extractUrls()).toEqual([]);
  });

  it('sends a search query the model wrote to Tavily and nowhere else', async () => {
    const query = `trip ${canary.url('/q?d=trip-budget')}`;

    await runTurn([
      { toolCalls: [{ name: 'webSearch', input: { query } }] },
      ANSWER,
    ]);

    expect(egress.searchQueries()).toEqual([query]);
    expect(egress.hosts()).toEqual([TAVILY_HOST]);
  });
});

describe('a compromised model: proposals store no foreign image (G5)', () => {
  it.each(FOREIGN_IMAGE_PAYLOADS)(
    'drops it from a create proposal: $name',
    async ({ markdown }) => {
      const { events } = await runTurn([
        {
          toolCalls: [
            {
              name: 'proposeCreateNote',
              input: {
                title: 'Trip budget',
                contentMarkdown: `${markdown}\n\n![kept](${STORED_IMAGE_URL})`,
              },
            },
          ],
        },
      ]);

      expectOnlyStoredImages(contentHtmlOf(proposalsOf(events)[0]));
    }
  );

  it('drops every one of them from an edit proposal', async () => {
    const { events } = await runTurn([
      {
        toolCalls: [
          {
            name: 'proposeEditNote',
            input: {
              noteId: OWN_NOTE.id,
              appendMarkdown: [
                ...FOREIGN_IMAGE_PAYLOADS.map((payload) => payload.markdown),
                `![kept](${STORED_IMAGE_URL})`,
              ].join('\n\n'),
            },
          },
        ],
      },
    ]);

    expectOnlyStoredImages(contentHtmlOf(proposalsOf(events)[0]));
  });

  it('drops every one of them from a whole-body update proposal', async () => {
    const { events } = await runTurn([
      {
        toolCalls: [
          {
            name: 'proposeUpdateNote',
            input: {
              noteId: OWN_NOTE.id,
              contentMarkdown: [
                ...FOREIGN_IMAGE_PAYLOADS.map((payload) => payload.markdown),
                `![kept](${STORED_IMAGE_URL})`,
              ].join('\n\n'),
            },
          },
        ],
      },
    ]);

    expectOnlyStoredImages(contentHtmlOf(proposalsOf(events)[0]));
  });
});

describe('a compromised model: the resume leg cannot propose (G6)', () => {
  it('offers no propose tool, and a propose call made anyway proposes nothing', async () => {
    const { events, scripted } = await runTurn(
      [
        {
          toolCalls: [
            {
              name: 'proposeCreateNote',
              input: { title: 'Again', contentMarkdown: 'Same note again.' },
            },
          ],
        },
        ANSWER,
      ],
      { resume: RESUMED }
    );

    expect(scripted.calls).toHaveLength(2);
    expect(
      scripted.calls.flatMap((call) =>
        call.toolNames.filter((name) => PROPOSE_TOOLS.has(name))
      )
    ).toEqual([]);
    expect(proposalsOf(events)).toEqual([]);
    expect(terminalOf(events)?.type).toBe('done');
  });
});

describe('a compromised model: a partial read cannot authorize a whole-body write (G7)', () => {
  it.each([
    ['truncated', TRUNCATED_NOTE],
    ['withheld', WITHHELD_NOTE],
  ] as const)(
    'refuses to replace the body of a %s note',
    async (status, note) => {
      const { events } = await runTurn([
        { toolCalls: [{ name: 'getNote', input: { noteId: note.id } }] },
        {
          toolCalls: [
            {
              name: 'proposeUpdateNote',
              input: { noteId: note.id, contentMarkdown: 'Only this now.' },
            },
          ],
        },
        ANSWER,
      ]);

      expect(toolOutputs(events, 'proposeUpdateNote')).toEqual([
        { error: AgentErrors.wholeBodyUpdateRefused(status).message },
      ]);
      expect(proposalsOf(events)).toEqual([]);
    }
  );

  it('still replaces the body of a note it read whole', async () => {
    const { events } = await runTurn([
      { toolCalls: [{ name: 'getNote', input: { noteId: OWN_NOTE.id } }] },
      {
        toolCalls: [
          {
            name: 'proposeUpdateNote',
            input: { noteId: OWN_NOTE.id, contentMarkdown: 'Only this now.' },
          },
        ],
      },
    ]);

    expect(proposalsOf(events)).toHaveLength(1);
  });
});

describe('a compromised model: one proposal per turn (G8)', () => {
  it('keeps one of two proposals made in one step', async () => {
    const { events, scripted } = await runTurn([
      {
        toolCalls: [
          {
            name: 'proposeCreateNote',
            input: { title: 'Trip budget', contentMarkdown: 'Keep it low.' },
          },
          {
            name: 'proposeShareNote',
            input: {
              noteId: OWN_NOTE.id,
              targetEmail: 'mallory@attacker.test',
              permission: 'editor',
            },
          },
        ],
      },
    ]);

    const outputs = [
      ...toolOutputs(events, 'proposeCreateNote'),
      ...toolOutputs(events, 'proposeShareNote'),
    ];
    const accepted = outputs.flatMap((output) => proposalIdOf(output) ?? []);
    expect(accepted).toHaveLength(1);
    expect(outputs.filter((output) => !proposalIdOf(output))).toEqual([
      { error: AgentErrors.proposalAlreadyPending().message },
    ]);
    expect(proposalsOf(events).map((proposal) => proposal.id)).toEqual(
      accepted
    );
    expect(scripted.calls).toHaveLength(1);
    expect(terminalOf(events)?.type).toBe('proposal');
  });

  it('ends the turn at the step that proposed, even when that step asked for more tools', async () => {
    const { events, scripted } = await runTurn([
      {
        toolCalls: [
          {
            name: 'proposeCreateNote',
            input: { title: 'Trip budget', contentMarkdown: 'Keep it low.' },
          },
          { name: 'getNote', input: { noteId: OWN_NOTE.id } },
        ],
      },
    ]);

    expect(scripted.calls).toHaveLength(1);
    expect(proposalsOf(events)).toHaveLength(1);
    expect(terminalOf(events)?.type).toBe('proposal');
  });
});

describe('a compromised model: a note store failure', () => {
  it('reaches the model as our generic message, never the query or its values', async () => {
    vi.spyOn(RecordingFixtureRetrieval.prototype, 'getBody').mockRejectedValue(
      new Error(`select * from notes where id = '${NOTE_STORE_SECRET}'`)
    );

    const { scripted } = await runTurn([
      {
        toolCalls: [
          {
            name: 'proposeEditNote',
            input: { noteId: OWN_NOTE.id, appendMarkdown: 'More.' },
          },
        ],
      },
      ANSWER,
    ]);

    const [, next] = scripted.calls;
    expect(next?.toolResults).toEqual([
      {
        toolName: 'proposeEditNote',
        output: 'ToolExecutionError: Note store request failed',
      },
    ]);
    expect(next?.text).not.toContain(NOTE_STORE_SECRET);
  });
});
