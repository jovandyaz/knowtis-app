import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { E2E } from '../support/environment';
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
      }, 20);
      await expect
        .poll(() => clients.every(({ receipts }) => receipts.length > 3))
        .toBe(true);
      expect(ownerA.read('guest-0')).toBeDefined();
      expect(ownerB.read('guest-1')).toBeDefined();
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
      await compose(
        ...(fault === 'redis' ? ['start', 'redis'] : ['unpause', 'database'])
      );
      restoreNeeded = false;
      const freshOwner = connect(owner.accessToken, 'a');
      await freshOwner.synced();
      freshOwner.write('recovered', 'new session');
      await delay(350);
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
      if (restoreNeeded) {
        await compose(
          ...(fault === 'redis' ? ['start', 'redis'] : ['unpause', 'database'])
        );
      }
      clients.forEach((client) => client.close());
    }
  });
}
