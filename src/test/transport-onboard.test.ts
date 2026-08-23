import { describe, expect, it } from 'vitest';
import { deriveOnboardStudentIds } from '@/lib/transport/onboard';

const ev = (student_id: string | null, event_type: string, occurred_at: string) =>
  ({ student_id, event_type, occurred_at }) as const;

describe('deriveOnboardStudentIds', () => {
  it('blocks a student who boarded but never disembarked', () => {
    expect(deriveOnboardStudentIds([ev('s1', 'BOARDING', '2026-01-01T07:00:00Z')])).toEqual(['s1']);
  });

  it('clears a student who boarded and then disembarked', () => {
    expect(deriveOnboardStudentIds([
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
      ev('s1', 'DISEMBARK', '2026-01-01T07:30:00Z'),
    ])).toEqual([]);
  });

  it('treats NO_SHOW as never boarded', () => {
    expect(deriveOnboardStudentIds([ev('s1', 'NO_SHOW', '2026-01-01T07:00:00Z')])).toEqual([]);
    expect(deriveOnboardStudentIds([
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
      ev('s1', 'NO_SHOW', '2026-01-01T07:05:00Z'),
    ])).toEqual([]);
  });

  it('is deterministic for repeated events', () => {
    const events = [
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
      ev('s1', 'BOARDING', '2026-01-01T07:01:00Z'),
      ev('s1', 'DISEMBARK', '2026-01-01T07:20:00Z'),
      ev('s1', 'BOARDING', '2026-01-01T07:25:00Z'),
    ];
    expect(deriveOnboardStudentIds(events)).toEqual(['s1']);
    expect(deriveOnboardStudentIds(events)).toEqual(deriveOnboardStudentIds(events));
  });

  it('handles mixed students', () => {
    expect(deriveOnboardStudentIds([
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
      ev('s2', 'BOARDING', '2026-01-01T07:02:00Z'),
      ev('s3', 'NO_SHOW', '2026-01-01T07:03:00Z'),
      ev('s2', 'DISEMBARK', '2026-01-01T07:40:00Z'),
    ])).toEqual(['s1']);
  });

  it('sorts unordered input by timestamp', () => {
    expect(deriveOnboardStudentIds([
      ev('s1', 'DISEMBARK', '2026-01-01T07:30:00Z'),
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
    ])).toEqual([]);
    expect(deriveOnboardStudentIds([
      ev('s1', 'BOARDING', '2026-01-01T07:40:00Z'),
      ev('s1', 'DISEMBARK', '2026-01-01T07:30:00Z'),
    ])).toEqual(['s1']);
  });

  it('ignores trip-level and null-student events', () => {
    expect(deriveOnboardStudentIds([
      ev(null, 'START_TRIP', '2026-01-01T06:55:00Z'),
      ev(null, 'LOCATION', '2026-01-01T07:10:00Z'),
      ev('s1', 'VEHICLE_CHECK', '2026-01-01T07:50:00Z'),
    ])).toEqual([]);
  });

  it('falls back to created_at when occurred_at is missing', () => {
    expect(deriveOnboardStudentIds([
      { student_id: 's1', event_type: 'DISEMBARK', created_at: '2026-01-01T07:30:00Z' },
      { student_id: 's1', event_type: 'BOARDING', created_at: '2026-01-01T07:00:00Z' },
    ])).toEqual([]);
  });
});
