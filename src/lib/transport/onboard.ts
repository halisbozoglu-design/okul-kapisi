import { TransportEventType } from '@/types/transport';

/**
 * Minimal event shape needed to reconstruct who may still be inside the vehicle.
 * No personal data — only ids, event type and a timestamp.
 */
export interface OnboardEventLike {
  student_id?: string | null;
  event_type: TransportEventType | string;
  /** ISO timestamp; `created_at` is used as a fallback when absent */
  occurred_at?: string | null;
  created_at?: string | null;
}

function timeOf(e: OnboardEventLike): string {
  return e.occurred_at ?? e.created_at ?? '';
}

/**
 * Deterministically derives the set of student ids that may still be on board.
 *
 * Rules:
 * - BOARDING puts the student on board
 * - DISEMBARK removes the student
 * - NO_SHOW means the student never boarded (removes)
 * - every other event type (START_TRIP, LOCATION, END_TRIP, VEHICLE_CHECK...) is ignored
 * - events are evaluated in chronological order (occurred_at, falling back to created_at);
 *   ties keep the original input order, so repeated events resolve deterministically
 */
export function deriveOnboardStudentIds(events: OnboardEventLike[]): string[] {
  const ordered = events
    .map((e, index) => ({ e, index }))
    .sort((a, b) => {
      const t = timeOf(a.e).localeCompare(timeOf(b.e));
      return t !== 0 ? t : a.index - b.index;
    });

  const onboard = new Set<string>();
  const order: string[] = [];

  for (const { e } of ordered) {
    const id = e.student_id;
    if (!id) continue;
    if (e.event_type === 'BOARDING') {
      if (!onboard.has(id)) { onboard.add(id); order.push(id); }
    } else if (e.event_type === 'DISEMBARK' || e.event_type === 'NO_SHOW') {
      onboard.delete(id);
    }
  }

  return order.filter(id => onboard.has(id));
}
