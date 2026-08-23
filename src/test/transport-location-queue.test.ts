import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocationQueue, MemoryQueueStore, MAX_QUEUE_SIZE, isRedundantPing, QueuedPing,
} from '@/lib/transport/locationQueue';

const T0 = new Date('2026-08-23T08:00:00.000Z').getTime();

const ping = (over: Partial<Omit<QueuedPing, 'id' | 'queuedAt'>> = {}) => ({
  tripId: 'trip-1',
  institutionId: 'inst-1',
  lat: 39.92,
  lng: 32.85,
  accuracy: 10,
  speed: 5,
  heading: 90,
  recordedAt: new Date(T0).toISOString(),
  ...over,
});

let store: MemoryQueueStore;
let queue: LocationQueue;

beforeEach(() => {
  store = new MemoryQueueStore();
  queue = new LocationQueue(store);
});

describe('isRedundantPing', () => {
  const prev: QueuedPing = { ...ping(), id: 'a', queuedAt: T0 };

  it('drops pings that are too soon after the previous one', () => {
    expect(isRedundantPing(prev, ping({ recordedAt: new Date(T0 + 3000).toISOString() }))).toBe(true);
  });

  it('drops pings that barely moved', () => {
    expect(isRedundantPing(prev, ping({
      recordedAt: new Date(T0 + 10000).toISOString(), lat: 39.92005,
    }))).toBe(true);
  });

  it('keeps pings that moved far enough or waited long enough', () => {
    expect(isRedundantPing(prev, ping({
      recordedAt: new Date(T0 + 10000).toISOString(), lat: 39.925,
    }))).toBe(false);
    expect(isRedundantPing(prev, ping({ recordedAt: new Date(T0 + 40000).toISOString() }))).toBe(false);
  });

  it('never compares across trips or without a previous ping', () => {
    expect(isRedundantPing(null, ping())).toBe(false);
    expect(isRedundantPing(prev, ping({ tripId: 'trip-2' }))).toBe(false);
  });
});

describe('LocationQueue enqueue', () => {
  it('dedupes near-identical consecutive pings', async () => {
    expect(await queue.enqueue(ping())).toBe(true);
    expect(await queue.enqueue(ping({ recordedAt: new Date(T0 + 2000).toISOString() }))).toBe(false);
    expect(await queue.size()).toBe(1);
  });

  it('is bounded and drops the oldest entries', async () => {
    for (let i = 0; i < MAX_QUEUE_SIZE + 25; i++) {
      await queue.enqueue(ping({
        recordedAt: new Date(T0 + i * 60000).toISOString(),
        lat: 39.92 + i * 0.01,
      }));
    }
    expect(await queue.size()).toBe(MAX_QUEUE_SIZE);
    const rows = await store.getAll();
    // oldest survivor is not the very first ping
    expect(rows[0].recordedAt).not.toBe(new Date(T0).toISOString());
  });
});

describe('LocationQueue trip isolation', () => {
  it('only flushes pings of the requested trip', async () => {
    await queue.enqueue(ping());
    await queue.enqueue(ping({ tripId: 'trip-2' }));
    const sent: string[] = [];
    const res = await queue.flush('trip-1', async (p) => { sent.push(p.tripId); return { ok: true }; });
    expect(sent).toEqual(['trip-1']);
    expect(res.sent).toBe(1);
    expect(await queue.size('trip-2')).toBe(1);
  });

  it('drops pings that belong to other trips', async () => {
    await queue.enqueue(ping());
    await queue.enqueue(ping({ tripId: 'trip-2' }));
    expect(await queue.dropOtherTrips('trip-2')).toBe(1);
    expect(await queue.size()).toBe(1);
    expect(await queue.size('trip-2')).toBe(1);
  });
});

describe('LocationQueue flush behaviour', () => {
  const three = async () => {
    for (let i = 0; i < 3; i++) {
      await queue.enqueue(ping({
        recordedAt: new Date(T0 + i * 60000).toISOString(), lat: 39.92 + i * 0.01,
      }));
    }
  };

  it('removes successfully sent pings and records order', async () => {
    await three();
    const order: string[] = [];
    const res = await queue.flush('trip-1', async (p) => { order.push(p.recordedAt); return { ok: true }; });
    expect(res).toEqual({ sent: 3, failed: false, remaining: 0 });
    expect(order).toEqual([...order].sort());
  });

  it('stops at the first failure and keeps the rest queued', async () => {
    await three();
    let n = 0;
    const res = await queue.flush('trip-1', async () => ({ ok: ++n === 1 }));
    expect(res.sent).toBe(1);
    expect(res.failed).toBe(true);
    expect(res.remaining).toBe(2);
  });

  it('treats a thrown sender as a failure without losing data', async () => {
    await three();
    const res = await queue.flush('trip-1', async () => { throw new Error('offline'); });
    expect(res).toEqual({ sent: 0, failed: true, remaining: 3 });
  });

  it('re-sends the remaining pings once the network is back', async () => {
    await three();
    let fail = true;
    await queue.flush('trip-1', async () => ({ ok: !fail }));
    fail = false;
    const res = await queue.flush('trip-1', async () => ({ ok: true }));
    expect(res.remaining).toBe(0);
  });
});
