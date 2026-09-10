import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import {
  E2E,
  QUIESCENCE_WINDOW_MS,
  REDIS_OUTAGE_BEYOND_RETRY_BUDGET_MS,
  TRAFFIC_INTERVAL_MS,
} from '../support/environment';
import { compose } from '../support/faults';
import {
  assertCutoff,
  beginCutoff,
  connectNote,
  type RealtimeClient,
} from './fixtures/realtime.fixture';
import { test } from './fixtures/sharing.fixture';

for (const fault of ['redis', 'postgres'] as const) {
  test(`active sessions fail closed with ${fault} unavailable across two API processes`, async ({
    sharing,
  }, testInfo) => {
    const { owner, recipient } = sharing;
    const note = await owner.createNote(`Authority ${fault} outage`);
    await owner.share(note.id, recipient.email, 'editor');
    const clients: RealtimeClient[] = [];
    const connect = (token: string, instance: 'a' | 'b') => {
      const client = connectNote(note.id, token, { instance });
      clients.push(client);
      return client;
    };
    let restoreNeeded = false;
    let traffic: ReturnType<typeof setInterval> | undefined;
    try {
      const ownerA = connect(owner.accessToken, 'a');
      const ownerB = connect(owner.accessToken, 'b');
      const guests = [
        connect(recipient.accessToken, 'a'),
        connect(recipient.accessToken, 'b'),
      ];
      await Promise.all(clients.map((client) => client.synced()));
      let sequence = 0;
      traffic = setInterval(() => {
        sequence++;
        ownerA.write('owner-a', sequence);
        ownerB.write('owner-b', sequence);
        guests.forEach((client, index) =>
          client.write(`guest-${index}`, sequence)
        );
      }, TRAFFIC_INTERVAL_MS);
      await expect
        .poll(() => clients.every(({ receipts }) => receipts.length > 3))
        .toBe(true);
      await expect
        .poll(() => ownerA.read('guest-1'))
        .toEqual(expect.any(Number));
      await expect
        .poll(() => ownerB.read('guest-0'))
        .toEqual(expect.any(Number));
      const closed = fault === 'redis' ? guests : clients.slice();
      const observation = beginCutoff(closed, [ownerA, ownerB]);
      restoreNeeded = true;
      await compose(
        ...(fault === 'redis'
          ? ['stop', '-t', '1', 'redis']
          : ['pause', 'database'])
      );
      const faultAcknowledgedMs = Math.round(
        performance.now() - observation.started
      );
      if (fault === 'redis') {
        const response = await owner.context.request.delete(
          `${E2E.apiA}/notes/${note.id}/share/${recipient.id}`,
          { headers: owner.headers }
        );
        expect(response.status()).toBe(204);
      }
      const measurements = await assertCutoff(observation);
      await testInfo.attach(`${fault}-cutoff`, {
        body: JSON.stringify({
          ...measurements,
          faultAcknowledgedMs,
          apiProcesses: 2,
        }),
        contentType: 'application/json',
      });
      clearInterval(traffic);
      traffic = undefined;
      guests.forEach((client, index) =>
        client.write(`post-expiry-${index}`, 'rejected')
      );
      const receiptCounts = guests.map(({ receipts }) => receipts.length);
      if (fault === 'redis') {
        await delay(REDIS_OUTAGE_BEYOND_RETRY_BUDGET_MS);
      }
      await compose(
        ...(fault === 'redis' ? ['start', 'redis'] : ['unpause', 'database'])
      );
      restoreNeeded = false;
      const freshOwner = connect(owner.accessToken, 'a');
      await freshOwner.synced();
      freshOwner.write('recovered', 'new session');
      const witness = connect(owner.accessToken, 'b');
      await witness.synced();
      await expect.poll(() => witness.read('recovered')).toBe('new session');
      witness.write('cross-instance', 'ok');
      await expect.poll(() => freshOwner.read('cross-instance')).toBe('ok');
      await delay(QUIESCENCE_WINDOW_MS);
      expect(guests.map(({ receipts }) => receipts.length)).toEqual(
        receiptCounts
      );
      guests.forEach((_client, index) =>
        expect(freshOwner.read(`post-expiry-${index}`)).toBeUndefined()
      );
      const freshRecipient = connect(recipient.accessToken, 'b');
      if (fault === 'redis') {
        await expect
          .poll(() => freshRecipient.failures.length)
          .toBeGreaterThan(0);
      } else {
        await freshRecipient.synced();
        freshRecipient.write('fresh-recipient', 'accepted');
        await expect
          .poll(() => freshOwner.read('fresh-recipient'))
          .toBe('accepted');
      }
    } finally {
      clearInterval(traffic);
      clients.forEach((client) => client.close());
      if (restoreNeeded) {
        await compose(
          ...(fault === 'redis' ? ['start', 'redis'] : ['unpause', 'database'])
        );
      }
    }
  });
}
