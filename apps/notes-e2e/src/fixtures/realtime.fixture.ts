import { setTimeout as delay } from 'node:timers/promises';

import {
  HocuspocusProvider,
  MessageType,
  type onMessageParameters,
} from '@hocuspocus/provider';
import { expect } from '@playwright/test';
import {
  createDecoder,
  readVarInt,
  readVarString,
  readVarUint,
} from 'lib0/decoding';
import * as Y from 'yjs';

import { E2E } from '../../support/environment';

export interface RealtimeClient {
  provider: HocuspocusProvider;
  document: Y.Doc;
  closes: { reason: string; at: number }[];
  failures: string[];
  scopes: string[];
  receipts: number[];
  updatesSent: number[];
  acknowledgements: { applied: boolean; at: number }[];
  guestApplications: number[];
  peer(): RealtimeClient;
  synced(): Promise<void>;
  reauthenticate(): Promise<void>;
  write(key: string, value: string | number): void;
  read(key: string): unknown;
  close(): void;
}

/** Uses the production wire protocol and real HTTP-issued credentials. */
export function connectNote(
  noteId: string,
  accessToken: string,
  options: {
    instance?: 'a' | 'b';
    shareToken?: string;
  } = {}
): RealtimeClient {
  const document = new Y.Doc();
  const closes: { reason: string; at: number }[] = [];
  const failures: string[] = [];
  const scopes: string[] = [];
  const receipts: number[] = [];
  const updatesSent: number[] = [];
  const acknowledgements: { applied: boolean; at: number }[] = [];
  const guestApplications: number[] = [];
  const url = new URL(options.instance === 'a' ? E2E.socketA : E2E.socketB);
  if (options.shareToken) {
    url.searchParams.set('shareToken', options.shareToken);
  }
  const provider = new HocuspocusProvider({
    url: url.href,
    name: noteId,
    document,
    token: accessToken,
    awareness: null,
    onClose: ({ event }) =>
      closes.push({ reason: event.reason, at: performance.now() }),
    onAuthenticationFailed: ({ reason }) => failures.push(reason),
    onAuthenticated: ({ scope }) => scopes.push(scope),
    onOutgoingMessage: ({ message }) => {
      // Generic replies own a separate encoder, so decoding them here would fail.
      if (message.type !== MessageType.Sync) {
        return;
      }
      const decoder = createDecoder(message.toUint8Array());
      readVarString(decoder);
      if (
        readVarUint(decoder) === MessageType.Sync &&
        readVarUint(decoder) === 2
      ) {
        updatesSent.push(performance.now());
      }
    },
  });
  // Bind here because constructor callbacks also reach the websocket transport,
  // whose message event has a different payload.
  provider.on('message', ({ message }: onMessageParameters) => {
    const decoder = createDecoder(new Uint8Array(message.data));
    readVarString(decoder);
    if (readVarUint(decoder) === MessageType.SyncStatus) {
      acknowledgements.push({
        applied: readVarInt(decoder) === 1,
        at: performance.now(),
      });
    }
  });
  document.getMap('acceptance').observe((event, transaction) => {
    if (
      transaction.origin === provider &&
      [...event.keysChanged].some((key) => key.startsWith('guest-'))
    ) {
      guestApplications.push(performance.now());
    }
  });
  document.on('update', (_update, origin) => {
    if (origin === provider) {
      receipts.push(performance.now());
    }
  });
  return {
    provider,
    document,
    closes,
    failures,
    scopes,
    receipts,
    updatesSent,
    acknowledgements,
    guestApplications,
    peer: () => connectNote(noteId, accessToken, options),
    async synced() {
      await expect.poll(() => provider.synced, { timeout: 10_000 }).toBe(true);
    },
    async reauthenticate() {
      const previous = scopes.length;
      await provider.sendToken();
      await expect.poll(() => scopes.length).toBeGreaterThan(previous);
      provider.startSync();
      await this.synced();
    },
    write(key: string, value: string | number) {
      document.getMap('acceptance').set(key, value);
    },
    read(key: string) {
      return document.getMap('acceptance').get(key);
    },
    close() {
      provider.destroy();
      document.destroy();
    },
  };
}

async function roundTrip(observer: RealtimeClient, key: string) {
  const peer = observer.peer();
  try {
    await peer.synced();
    observer.write('server-control', key);
    await expect.poll(() => peer.read('server-control')).toBe(key);
    peer.write('server-reply', key);
    await expect.poll(() => observer.read('server-reply')).toBe(key);
    expect(peer.read(key)).toBeUndefined();
    expect(observer.read(key)).toBeUndefined();
  } finally {
    peer.close();
  }
}

export async function deniedWrite(
  writer: RealtimeClient,
  observer: RealtimeClient,
  key: string
) {
  const sent = writer.updatesSent.length;
  const rejected = writer.acknowledgements.filter(
    ({ applied }) => !applied
  ).length;
  writer.write(key, 'must not be accepted');
  expect(writer.updatesSent.length).toBeGreaterThan(sent);
  await expect
    .poll(
      () => writer.acknowledgements.filter(({ applied }) => !applied).length
    )
    .toBeGreaterThan(rejected);
  await roundTrip(observer, key);
}

export async function revokedWrite(
  writer: RealtimeClient,
  observer: RealtimeClient,
  key: string
) {
  writer.write(key, 'must not be accepted');
  const rejected = writer.peer();
  try {
    await expect.poll(() => rejected.failures.length).toBeGreaterThan(0);
    const received = writer.receipts.length;
    await roundTrip(observer, key);
    expect(writer.receipts.length).toBe(received);
    expect(writer.read('server-control')).not.toBe(key);
  } finally {
    rejected.close();
  }
}

export function beginCutoff(
  clients: RealtimeClient[],
  observers: RealtimeClient[]
) {
  for (const client of clients) {
    expect(client.provider.synced).toBe(true);
    expect(client.closes).toHaveLength(0);
    expect(client.receipts.length).toBeGreaterThan(0);
    expect(client.acknowledgements.some(({ applied }) => applied)).toBe(true);
  }
  for (const observer of observers) {
    expect(observer.guestApplications.length).toBeGreaterThan(0);
  }
  return {
    started: performance.now(),
    clients,
    observers,
    positions: clients.map((client) => ({
      receipts: client.receipts.length,
      acknowledgements: client.acknowledgements.length,
    })),
    applications: observers.map(
      (observer) => observer.guestApplications.length
    ),
  };
}

export async function assertCutoff(
  observation: ReturnType<typeof beginCutoff>
) {
  const { clients, observers, started } = observation;
  await expect
    .poll(() => clients.every(({ closes }) => closes.length > 0), {
      timeout: 5000,
    })
    .toBe(true);
  for (const client of clients) {
    const first = client.closes[0];
    expect(first?.reason).toMatch(/^Note access (changed|unavailable)$/);
    expect(first?.at).toBeGreaterThanOrEqual(started);
  }
  const counts = clients.map((client) => [
    client.receipts.length,
    client.acknowledgements.length,
  ]);
  const applications = observers.map(
    (observer) => observer.guestApplications.length
  );
  await delay(350);
  expect(
    clients.map((client) => [
      client.receipts.length,
      client.acknowledgements.length,
    ])
  ).toEqual(counts);
  expect(
    observers.map((observer) => observer.guestApplications.length)
  ).toEqual(applications);
  const elapsed = (values: number[]) =>
    Math.round(Math.max(started, ...values) - started);
  const measurements = {
    closeMs: elapsed(
      clients.flatMap(({ closes }) => closes.map(({ at }) => at))
    ),
    lastReceiptMs: elapsed(
      clients.flatMap((client, index) =>
        client.receipts.slice(observation.positions[index]?.receipts)
      )
    ),
    lastAcceptedAckMs: elapsed(
      clients.flatMap((client, index) =>
        client.acknowledgements
          .slice(observation.positions[index]?.acknowledgements)
          .filter(({ applied }) => applied)
          .map(({ at }) => at)
      )
    ),
    lastGuestReplicaMs: elapsed(
      observers.flatMap((observer, index) =>
        observer.guestApplications.slice(observation.applications[index])
      )
    ),
  };
  for (const value of Object.values(measurements)) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(5000);
  }
  return measurements;
}
