/**
 * Offline-tolerant location ping queue for the driver screen.
 *
 * Only location telemetry is stored on the device (trip id + coordinates).
 * No student / guardian PII and no auth tokens are ever written here.
 *
 * Storage: IndexedDB when available, in-memory fallback otherwise.
 */

export interface QueuedPing {
  /** local id (not a database id) */
  id: string;
  tripId: string;
  institutionId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
  queuedAt: number;
}

export const MAX_QUEUE_SIZE = 200;
/** pings closer than this in time+space to the previous queued one are dropped */
export const QUEUE_MIN_INTERVAL_MS = 8000;
export const QUEUE_MIN_DISTANCE_M = 20;

export interface QueueStore {
  getAll(): Promise<QueuedPing[]>;
  put(ping: QueuedPing): Promise<void>;
  remove(ids: string[]): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryQueueStore implements QueueStore {
  private rows: QueuedPing[] = [];
  async getAll() { return [...this.rows]; }
  async put(ping: QueuedPing) { this.rows.push(ping); }
  async remove(ids: string[]) {
    const set = new Set(ids);
    this.rows = this.rows.filter(r => !set.has(r.id));
  }
  async clear() { this.rows = []; }
}

const DB_NAME = 'mimaros-transport';
const DB_VERSION = 1;
const STORE = 'location_queue';

export class IndexedDbQueueStore implements QueueStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  static isSupported() {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll() {
    const rows = await this.tx<QueuedPing[]>('readonly', s => s.getAll() as IDBRequest<QueuedPing[]>);
    return rows.sort((a, b) => a.queuedAt - b.queuedAt);
  }
  async put(ping: QueuedPing) { await this.tx('readwrite', s => s.put(ping)); }
  async remove(ids: string[]) {
    for (const id of ids) await this.tx('readwrite', s => s.delete(id));
  }
  async clear() { await this.tx('readwrite', s => s.clear()); }
}

export function createQueueStore(): QueueStore {
  try {
    if (IndexedDbQueueStore.isSupported()) return new IndexedDbQueueStore();
  } catch {
    /* fall through */
  }
  return new MemoryQueueStore();
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** True when `next` is far enough (time or distance) from the last queued ping. */
export function isRedundantPing(prev: QueuedPing | null, next: Omit<QueuedPing, 'id' | 'queuedAt'>) {
  if (!prev || prev.tripId !== next.tripId) return false;
  const dt = Math.abs(new Date(next.recordedAt).getTime() - new Date(prev.recordedAt).getTime());
  if (dt < QUEUE_MIN_INTERVAL_MS) return true;
  return distanceMeters(prev, next) < QUEUE_MIN_DISTANCE_M && dt < 30000;
}

export type PingSender = (ping: QueuedPing) => Promise<{ ok: boolean }>;

export interface FlushResult {
  sent: number;
  failed: boolean;
  remaining: number;
}

export class LocationQueue {
  private flushing = false;
  private seq = 0;

  constructor(private store: QueueStore = createQueueStore()) {}

  /** Enqueue a ping. Returns false when the ping was dropped as redundant. */
  async enqueue(ping: Omit<QueuedPing, 'id' | 'queuedAt'>): Promise<boolean> {
    const rows = await this.store.getAll();
    const sameTrip = rows.filter(r => r.tripId === ping.tripId);
    const prev = sameTrip.length ? sameTrip[sameTrip.length - 1] : null;
    if (isRedundantPing(prev, ping)) return false;

    const queuedAt = Date.now();
    this.seq += 1;
    await this.store.put({ ...ping, id: `${queuedAt}-${this.seq}`, queuedAt });

    // bounded: drop the oldest entries beyond the cap
    const after = await this.store.getAll();
    if (after.length > MAX_QUEUE_SIZE) {
      const overflow = after.slice(0, after.length - MAX_QUEUE_SIZE).map(r => r.id);
      await this.store.remove(overflow);
    }
    return true;
  }

  async size(tripId?: string) {
    const rows = await this.store.getAll();
    return tripId ? rows.filter(r => r.tripId === tripId).length : rows.length;
  }

  /** Remove every queued ping that does not belong to `tripId`. */
  async dropOtherTrips(tripId: string | null) {
    const rows = await this.store.getAll();
    const stale = rows.filter(r => r.tripId !== tripId).map(r => r.id);
    if (stale.length) await this.store.remove(stale);
    return stale.length;
  }

  async clear() { await this.store.clear(); }

  /**
   * Send queued pings for a single trip, oldest first. Stops at the first
   * failure so ordering is preserved and nothing is lost.
   */
  async flush(tripId: string, send: PingSender): Promise<FlushResult> {
    if (this.flushing) return { sent: 0, failed: false, remaining: await this.size(tripId) };
    this.flushing = true;
    let sent = 0;
    let failed = false;
    try {
      const rows = (await this.store.getAll()).filter(r => r.tripId === tripId);
      for (const row of rows) {
        const res = await send(row).catch(() => ({ ok: false }));
        if (!res.ok) { failed = true; break; }
        await this.store.remove([row.id]);
        sent += 1;
      }
    } finally {
      this.flushing = false;
    }
    return { sent, failed, remaining: await this.size(tripId) };
  }
}
