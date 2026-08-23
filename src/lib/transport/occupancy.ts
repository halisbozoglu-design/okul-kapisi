/**
 * Live vehicle occupancy derived from `transport_events` history.
 *
 * Pure + deterministic: no persistence, no new table. Occupancy is always
 * re-derived from the event log (the same source of truth used by
 * `deriveOnboardStudentIds`), so repeated BOARDING/DISEMBARK events can never
 * inflate the count.
 *
 * CONCURRENCY HONESTY: this is a read-then-write check performed by the client
 * right before inserting a BOARDING event. It is NOT atomic. Two devices
 * boarding different students at the exact same moment can both pass the check
 * and push the vehicle one seat over capacity. That residual race is accepted
 * for V1 (no migration): the live management screen surfaces any
 * `occupancy > capacity` as a CRITICAL alert so it is never silently hidden.
 */

import { deriveOnboardStudentIds, type OnboardEventLike } from './onboard';

export interface OccupancyState {
  /** student ids currently considered on board, in boarding order */
  onboardStudentIds: string[];
  /** number of students currently on board */
  count: number;
  /** usable capacity, or null when the vehicle has no reliable capacity */
  capacity: number | null;
  /** true when a positive capacity is defined */
  hasCapacity: boolean;
  /** true when count >= capacity (only meaningful when hasCapacity) */
  isFull: boolean;
  /** true when count > capacity — data/ops problem, must be surfaced */
  isOverflow: boolean;
  /** how many students above capacity (0 when none / unknown) */
  overflowBy: number;
}

/** Capacity is only trusted when it is a finite positive integer. */
export function normalizeCapacity(capacity: number | null | undefined): number | null {
  if (capacity == null) return null;
  if (!Number.isFinite(capacity)) return null;
  if (capacity <= 0) return null;
  return Math.floor(capacity);
}

export function computeOccupancy(
  events: OnboardEventLike[],
  capacity: number | null | undefined,
): OccupancyState {
  const onboardStudentIds = deriveOnboardStudentIds(events);
  const count = onboardStudentIds.length;
  const cap = normalizeCapacity(capacity);
  const overflowBy = cap != null && count > cap ? count - cap : 0;
  return {
    onboardStudentIds,
    count,
    capacity: cap,
    hasCapacity: cap != null,
    isFull: cap != null && count >= cap,
    isOverflow: overflowBy > 0,
    overflowBy,
  };
}

export interface BoardingDecision {
  allowed: boolean;
  /** user-facing Turkish reason when blocked */
  reason?: string;
  occupancy: OccupancyState;
}

/**
 * Decides whether a BOARDING event may be written for `studentId`.
 * - already on board -> allowed (idempotent, does not consume a new seat)
 * - no reliable capacity -> allowed (never invent a limit)
 * - full -> blocked
 */
export function canBoardStudent(
  events: OnboardEventLike[],
  capacity: number | null | undefined,
  studentId: string,
): BoardingDecision {
  const occupancy = computeOccupancy(events, capacity);
  if (occupancy.onboardStudentIds.includes(studentId)) {
    return { allowed: true, occupancy };
  }
  if (!occupancy.hasCapacity) return { allowed: true, occupancy };
  if (occupancy.count >= (occupancy.capacity as number)) {
    return {
      allowed: false,
      reason: `Araç kapasitesi dolu (${occupancy.count}/${occupancy.capacity}). Yeni biniş kaydedilemez.`,
      occupancy,
    };
  }
  return { allowed: true, occupancy };
}

/** "8 / 20" or "8 / kapasite tanımlı değil" */
export function formatOccupancy(state: OccupancyState): string {
  return state.hasCapacity
    ? `${state.count} / ${state.capacity}`
    : `${state.count} / kapasite tanımlı değil`;
}
