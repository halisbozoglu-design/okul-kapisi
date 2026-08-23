import { TransportDirection } from '@/types/transport';

export interface TransportAbsence {
  id: string;
  institution_id: string;
  student_id: string;
  /** yyyy-mm-dd (local school day) */
  absence_date: string;
  direction: TransportDirection;
  reason: string | null;
  cancelled_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export const ABSENCE_DIRECTION_LABELS: Record<TransportDirection, string> = {
  to_school: 'Sabah (Okula gidiş)',
  to_home: 'Dönüş (Eve dönüş)',
  both: 'Tüm gün',
};

/** Local (not UTC) yyyy-mm-dd, so "bugün" matches the user's calendar day. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isActiveAbsence(a: TransportAbsence): boolean {
  return a.cancelled_at == null && a.deleted_at == null;
}

/**
 * True when the absence record covers the given trip/assignment direction.
 * `both` on either side matches, so a full-day notice covers morning and return.
 */
export function absenceCoversDirection(
  absenceDirection: TransportDirection,
  tripDirection: TransportDirection | null | undefined,
): boolean {
  if (absenceDirection === 'both') return true;
  if (!tripDirection) return false;
  if (tripDirection === 'both') return true;
  return absenceDirection === tripDirection;
}

/** Finds the active absence covering a student on a given date + direction. */
export function findActiveAbsence(
  absences: TransportAbsence[],
  studentId: string,
  dateKey: string,
  direction: TransportDirection | null | undefined,
): TransportAbsence | null {
  return (
    absences.find(
      a =>
        a.student_id === studentId &&
        a.absence_date === dateKey &&
        isActiveAbsence(a) &&
        absenceCoversDirection(a.direction, direction),
    ) ?? null
  );
}
