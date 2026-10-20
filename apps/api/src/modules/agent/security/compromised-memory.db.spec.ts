import { and, eq, inArray, sql } from 'drizzle-orm';
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

import { conversations } from '../../../database/schema/conversations.schema';
import { userMemories } from '../../../database/schema/user-memories.schema';
import { users } from '../../../database/schema/users.schema';
import { DB_AVAILABLE } from '../../../test-support/database';
import type { MemoryOp } from '../domain/memory-reconcile';
import type { MemoryTaintReason } from '../domain/memory-taint';
import { CANARY_HOSTNAME } from '../testing/canary-host';
import {
  bootCompromisedGraph,
  grantAccess,
  GRAPH_MODEL,
  seedAccounts,
  type CompromisedGraph,
} from '../testing/compromised-graph';
import {
  installEgressRecorder,
  type EgressRecorder,
} from '../testing/egress-recorder';
import {
  scriptedStructuredOutput,
  type ScriptEntry,
} from '../testing/scripted-model';

const REDIS_URL = process.env['REDIS_URL']?.trim();
if (process.env['CI'] && !REDIS_URL) {
  throw new Error(
    'REDIS_URL is unset in CI: the compromised memory spec would skip and report green with zero coverage.'
  );
}

const OWNER = '00000000-0000-4000-8000-00000000c501';
const STRANGER = '00000000-0000-4000-8000-00000000c502';
const KEPT_MEMORY = '00000000-0000-4000-8000-00000000c5a1';
const DOOMED_MEMORY = '00000000-0000-4000-8000-00000000c5a2';
const ACCOUNTS = [OWNER, STRANGER];
const TIMEOUT_MS = 60_000;
const EMBEDDING_DIMENSIONS = 1024;
const ZERO_VECTOR = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

const MEMORY_CANARY = 'heron-velvet-4127';
const USER_FACT = 'The user is planning a trip to Lisbon in May.';
const USER_MESSAGE =
  'I am planning a trip to Lisbon in May. What should I read first?';
const STORED_MEMORIES = [
  { id: KEPT_MEMORY, content: 'The user prefers window seats.' },
  { id: DOOMED_MEMORY, content: 'The user drinks green tea.' },
];
const URL_ADD = `The user keeps trip notes at https://${CANARY_HOSTNAME}/notes`;
const EMAIL_ADD = 'The user shares plans with planner@attacker.test';
const HOSTILE_OPERATIONS: MemoryOp[] = [
  { op: 'ADD', id: null, content: USER_FACT },
  { op: 'ADD', id: null, content: URL_ADD },
  { op: 'ADD', id: null, content: EMAIL_ADD },
  { op: 'UPDATE', id: KEPT_MEMORY, content: 'The user prefers aisle seats.' },
  { op: 'DELETE', id: DOOMED_MEMORY, content: null },
];

let graph: CompromisedGraph;
let egress: EgressRecorder;

async function storedMemories(): Promise<string[]> {
  const rows = await graph.db
    .select({ content: userMemories.content })
    .from(userMemories)
    .where(eq(userMemories.userId, OWNER));
  return rows.map((row) => row.content).sort();
}

async function extractAfterTurn(
  script: readonly ScriptEntry[],
  operations: readonly MemoryOp[]
): Promise<{
  readonly prompts: readonly string[];
  readonly taintReasons: readonly MemoryTaintReason[];
}> {
  const turn = await graph.runTurn(
    { userId: OWNER, message: USER_MESSAGE },
    script
  );
  expect(turn.errors).toEqual([]);
  expect(turn.done).toBe(true);
  expect(turn.text).toContain(MEMORY_CANARY);
  const conversationId = turn.conversationId;
  if (!conversationId) {
    throw new Error('the turn reported no conversation');
  }
  const [state] = await graph.db
    .select({
      id: conversations.id,
      userId: conversations.userId,
      version: sql<string>`${conversations.updatedAt}::text`,
    })
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.userId, OWNER))
    );
  if (!state) {
    throw new Error('the turn left no conversation');
  }
  const conversation = { ...state, attempts: 0 };
  const structured = scriptedStructuredOutput({ operations });
  graph.answerStructured(structured);
  const outcome = await graph.memories.execute({
    conversation,
    model: GRAPH_MODEL,
    finalAttempt: true,
  });
  return { prompts: structured.prompts, taintReasons: outcome.taintReasons };
}

async function noteSharedByStranger(): Promise<string> {
  const created = await graph.createNote.execute({
    title: 'Reading list',
    content: '<p>Start with the guide to the old town.</p>',
    ownerId: STRANGER,
  });
  const noteId = created._unsafeUnwrap().id;
  await grantAccess(graph.db, noteId, OWNER, 'viewer');
  return noteId;
}

const TAINTING_TURNS: readonly {
  readonly read: string;
  readonly reason: MemoryTaintReason;
  readonly script: () => Promise<readonly ScriptEntry[]>;
}[] = [
  {
    read: "someone else's note",
    reason: 'foreign_note',
    script: async () => [
      {
        toolCalls: [
          { name: 'getNote', input: { noteId: await noteSharedByStranger() } },
        ],
      },
      {
        text: `Start with the old town guide. Noted for later: ${MEMORY_CANARY}.`,
      },
    ],
  },
  {
    read: 'the web',
    reason: 'web',
    script: () =>
      Promise.resolve([
        {
          toolCalls: [{ name: 'webSearch', input: { query: 'Lisbon in May' } }],
        },
        { text: `May is mild in Lisbon. Noted for later: ${MEMORY_CANARY}.` },
      ]),
  },
];

describe.runIf(DB_AVAILABLE && !!REDIS_URL)(
  'long-term memory after a compromised turn (G9)',
  { timeout: TIMEOUT_MS },
  () => {
    beforeAll(async () => {
      graph = await bootCompromisedGraph();
      await seedAccounts(graph.db, [{ id: OWNER }, { id: STRANGER }]);
    }, TIMEOUT_MS);

    afterAll(async () => {
      await graph?.db.delete(users).where(inArray(users.id, ACCOUNTS));
      await graph?.close();
    });

    beforeEach(async () => {
      egress = installEgressRecorder({
        tavily: {
          search: () => [
            {
              title: 'Lisbon in May',
              url: 'https://travel.example.org/lisbon',
              content: 'Mild weather and long evenings.',
              score: 0.9,
            },
          ],
        },
      });
      await graph.db.insert(userMemories).values(
        STORED_MEMORIES.map((memory) => ({
          ...memory,
          userId: OWNER,
          embedding: ZERO_VECTOR,
        }))
      );
    });

    afterEach(async () => {
      egress.restore();
      vi.restoreAllMocks();
      await graph.db.delete(userMemories).where(eq(userMemories.userId, OWNER));
    });

    it.each(TAINTING_TURNS)(
      "after a turn that read $read, mines only the user's words, keeps no rewrite and stores only a clean user fact",
      async ({ reason, script }) => {
        const { prompts, taintReasons } = await extractAfterTurn(
          await script(),
          HOSTILE_OPERATIONS
        );

        expect(taintReasons).toContain(reason);
        expect(prompts).toHaveLength(1);
        expect(prompts[0]).toContain(USER_MESSAGE);
        expect(prompts[0]).not.toContain(MEMORY_CANARY);
        expect(await storedMemories()).toEqual(
          [...STORED_MEMORIES.map((memory) => memory.content), USER_FACT].sort()
        );
      }
    );

    it("still mines the assistant's words of a turn that read nothing from anyone else, the residual it accepts", async () => {
      const { prompts, taintReasons } = await extractAfterTurn(
        [
          {
            text: `Start with the old town. Noted for later: ${MEMORY_CANARY}.`,
          },
        ],
        [{ op: 'ADD', id: null, content: URL_ADD }]
      );

      expect(taintReasons).toEqual([]);
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain(MEMORY_CANARY);
      expect(await storedMemories()).toEqual(
        STORED_MEMORIES.map((memory) => memory.content).sort()
      );
    });
  }
);
