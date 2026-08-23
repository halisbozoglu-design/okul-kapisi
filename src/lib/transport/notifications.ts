import { TransportEventType, TransportDirection } from '@/types/transport';
import { estimateEta, LatLng, EtaResult } from '@/lib/transport/eta';
import { TransportAbsence, findActiveAbsence } from '@/lib/transport/absences';

export type TransportNotificationType = 'BOARDING' | 'NO_SHOW' | 'DISEMBARK' | 'APPROACHING';

export interface TransportNotification {
  id: string;
  student_id: string;
  trip_id: string | null;
  type: TransportNotificationType;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export const ATTENDANCE_NOTIFICATION_EVENTS: TransportEventType[] = [
  'BOARDING',
  'NO_SHOW',
  'DISEMBARK',
];

/**
 * Deterministic key mirroring the DB trigger, so the same event can be
 * processed repeatedly without ever producing a duplicate notification.
 */
export function attendanceIdempotencyKey(
  eventType: TransportEventType,
  eventId: string,
  guardianUserId: string,
): string {
  return `${eventType}:${eventId}:${guardianUserId}`;
}

/** One approaching notification per trip + student + guardian. */
export function approachingIdempotencyKey(
  tripId: string,
  studentId: string,
  guardianUserId: string,
): string {
  return `APPROACHING:${tripId}:${studentId}:${guardianUserId}`;
}

/** Client-side dedupe key (guardian list is never downloaded by the driver). */
export function approachingRequestKey(tripId: string, studentId: string): string {
  return `${tripId}:${studentId}`;
}

export interface ApproachingCandidateInput {
  tripId: string;
  tripDirection: TransportDirection | null;
  tripStatus: string | null;
  vehicle: LatLng | null;
  lastLocationAt: string | null;
  lastSpeedMs?: number | null;
  dateKey: string;
  absences: TransportAbsence[];
  /** already requested in this session (trip:student) */
  alreadyRequested: Set<string>;
  /** students already boarded / no-show / dropped off on this trip */
  settledStudentIds: Set<string>;
  students: { studentId: string; stop: LatLng | null }[];
  now?: number;
}

export interface ApproachingCandidate {
  studentId: string;
  requestKey: string;
  eta: EtaResult;
}

/**
 * Picks the students the driver client should ask the server to notify about.
 * Suppresses absences, stale GPS, already-settled students and repeats, so the
 * secured RPC is only called a handful of times per trip.
 */
export function selectApproachingCandidates(
  input: ApproachingCandidateInput,
): ApproachingCandidate[] {
  if (input.tripStatus !== 'active') return [];
  const out: ApproachingCandidate[] = [];
  for (const s of input.students) {
    const key = approachingRequestKey(input.tripId, s.studentId);
    if (input.alreadyRequested.has(key)) continue;
    if (input.settledStudentIds.has(s.studentId)) continue;
    if (findActiveAbsence(input.absences, s.studentId, input.dateKey, input.tripDirection)) continue;
    const eta = estimateEta({
      vehicle: input.vehicle,
      stop: s.stop,
      lastLocationAt: input.lastLocationAt,
      lastSpeedMs: input.lastSpeedMs,
      now: input.now,
    });
    if (!eta.available || !eta.approaching) continue;
    out.push({ studentId: s.studentId, requestKey: key, eta });
  }
  return out;
}

export const NOTIFICATION_TITLES: Record<TransportNotificationType, string> = {
  BOARDING: 'Servise bindi',
  NO_SHOW: 'Servise binmedi',
  DISEMBARK: 'Servisten indi',
  APPROACHING: 'Servis yaklaşıyor',
};
