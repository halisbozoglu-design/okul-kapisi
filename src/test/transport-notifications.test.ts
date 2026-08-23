import { describe, it, expect } from 'vitest';
import {
  attendanceIdempotencyKey,
  approachingIdempotencyKey,
  approachingRequestKey,
  selectApproachingCandidates,
} from '@/lib/transport/notifications';
import { TransportAbsence } from '@/lib/transport/absences';

const NOW = new Date('2026-08-23T08:00:00.000Z').getTime();
const fresh = new Date(NOW - 20_000).toISOString();
const stale = new Date(NOW - 15 * 60_000).toISOString();

const stopNear = { lat: 39.9255, lng: 32.85 };
const stopFar = { lat: 39.80, lng: 32.85 };
const vehicle = { lat: 39.92, lng: 32.85 };

const base = {
  tripId: 'trip-1',
  tripDirection: 'to_school' as const,
  tripStatus: 'active',
  vehicle,
  lastLocationAt: fresh,
  lastSpeedMs: null,
  dateKey: '2026-08-23',
  absences: [] as TransportAbsence[],
  alreadyRequested: new Set<string>(),
  settledStudentIds: new Set<string>(),
  students: [{ studentId: 's1', stop: stopNear }],
  now: NOW,
};

const absence: TransportAbsence = {
  id: 'a1', institution_id: 'i', student_id: 's1', absence_date: '2026-08-23',
  direction: 'to_school', reason: null, cancelled_at: null, deleted_at: null,
  created_at: '2026-08-22T10:00:00Z',
};

describe('idempotency keys', () => {
  it('are deterministic per event and guardian', () => {
    expect(attendanceIdempotencyKey('BOARDING', 'e1', 'g1')).toBe('BOARDING:e1:g1');
    expect(attendanceIdempotencyKey('BOARDING', 'e1', 'g1'))
      .toBe(attendanceIdempotencyKey('BOARDING', 'e1', 'g1'));
    expect(attendanceIdempotencyKey('NO_SHOW', 'e1', 'g1'))
      .not.toBe(attendanceIdempotencyKey('BOARDING', 'e1', 'g1'));
    expect(attendanceIdempotencyKey('BOARDING', 'e1', 'g2'))
      .not.toBe(attendanceIdempotencyKey('BOARDING', 'e1', 'g1'));
  });

  it('scopes approaching to trip + student + guardian', () => {
    expect(approachingIdempotencyKey('t1', 's1', 'g1')).toBe('APPROACHING:t1:s1:g1');
    expect(approachingIdempotencyKey('t2', 's1', 'g1'))
      .not.toBe(approachingIdempotencyKey('t1', 's1', 'g1'));
    expect(approachingRequestKey('t1', 's1')).toBe('t1:s1');
  });
});

describe('selectApproachingCandidates', () => {
  it('selects a student whose stop is close and GPS is fresh', () => {
    const r = selectApproachingCandidates(base);
    expect(r.map(c => c.studentId)).toEqual(['s1']);
    expect(r[0].eta.approaching).toBe(true);
  });

  it('skips inactive trips and far stops', () => {
    expect(selectApproachingCandidates({ ...base, tripStatus: 'completed' })).toHaveLength(0);
    expect(selectApproachingCandidates({
      ...base, students: [{ studentId: 's1', stop: stopFar }], lastSpeedMs: 12,
    })).toHaveLength(0);
  });

  it('suppresses when GPS is stale or stop is unknown', () => {
    expect(selectApproachingCandidates({ ...base, lastLocationAt: stale })).toHaveLength(0);
    expect(selectApproachingCandidates({
      ...base, students: [{ studentId: 's1', stop: null }],
    })).toHaveLength(0);
  });

  it('suppresses students with an active absence for this direction', () => {
    expect(selectApproachingCandidates({ ...base, absences: [absence] })).toHaveLength(0);
    // return-trip notice does not suppress the morning trip
    expect(selectApproachingCandidates({
      ...base, absences: [{ ...absence, direction: 'to_home' }],
    })).toHaveLength(1);
    // cancelled notice does not suppress
    expect(selectApproachingCandidates({
      ...base, absences: [{ ...absence, cancelled_at: '2026-08-22T12:00:00Z' }],
    })).toHaveLength(1);
  });

  it('never repeats for the same trip + student and skips settled students', () => {
    expect(selectApproachingCandidates({
      ...base, alreadyRequested: new Set(['trip-1:s1']),
    })).toHaveLength(0);
    expect(selectApproachingCandidates({
      ...base, settledStudentIds: new Set(['s1']),
    })).toHaveLength(0);
  });
});
