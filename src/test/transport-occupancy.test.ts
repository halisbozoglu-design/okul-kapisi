import { describe, expect, it } from 'vitest';
import {
  canBoardStudent, computeOccupancy, formatOccupancy, normalizeCapacity,
} from '@/lib/transport/occupancy';

const ev = (student_id: string | null, event_type: string, occurred_at: string) =>
  ({ student_id, event_type, occurred_at });

describe('normalizeCapacity', () => {
  it('rejects null, zero and negative values', () => {
    expect(normalizeCapacity(null)).toBeNull();
    expect(normalizeCapacity(undefined)).toBeNull();
    expect(normalizeCapacity(0)).toBeNull();
    expect(normalizeCapacity(-3)).toBeNull();
    expect(normalizeCapacity(Number.NaN)).toBeNull();
  });
  it('accepts positive capacity', () => {
    expect(normalizeCapacity(12)).toBe(12);
    expect(normalizeCapacity(12.7)).toBe(12);
  });
});

describe('computeOccupancy', () => {
  it('counts boardings and removes disembarks', () => {
    const o = computeOccupancy([
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
      ev('s2', 'BOARDING', '2026-01-01T07:05:00Z'),
      ev('s1', 'DISEMBARK', '2026-01-01T07:40:00Z'),
    ], 10);
    expect(o.count).toBe(1);
    expect(o.onboardStudentIds).toEqual(['s2']);
    expect(o.isFull).toBe(false);
  });

  it('does not count NO_SHOW students', () => {
    const o = computeOccupancy([
      ev('s1', 'NO_SHOW', '2026-01-01T07:00:00Z'),
      ev('s2', 'BOARDING', '2026-01-01T07:01:00Z'),
      ev('s2', 'NO_SHOW', '2026-01-01T07:02:00Z'),
    ], 4);
    expect(o.count).toBe(0);
  });

  it('duplicate boarding does not inflate the count', () => {
    const o = computeOccupancy([
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
      ev('s1', 'BOARDING', '2026-01-01T07:01:00Z'),
      ev('s1', 'BOARDING', '2026-01-01T07:02:00Z'),
    ], 2);
    expect(o.count).toBe(1);
  });

  it('handles out-of-order timestamps deterministically', () => {
    const events = [
      ev('s1', 'DISEMBARK', '2026-01-01T07:30:00Z'),
      ev('s2', 'BOARDING', '2026-01-01T07:10:00Z'),
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
    ];
    const a = computeOccupancy(events, 5);
    const b = computeOccupancy([...events].reverse(), 5);
    expect(a.count).toBe(1);
    expect(a.onboardStudentIds).toEqual(['s2']);
    expect(b.onboardStudentIds).toEqual(a.onboardStudentIds);
  });

  it('treats undefined/0 capacity as "not defined"', () => {
    const events = [ev('s1', 'BOARDING', '2026-01-01T07:00:00Z')];
    for (const cap of [null, undefined, 0]) {
      const o = computeOccupancy(events, cap as number | null | undefined);
      expect(o.hasCapacity).toBe(false);
      expect(o.isFull).toBe(false);
      expect(o.isOverflow).toBe(false);
    }
    expect(formatOccupancy(computeOccupancy(events, null)))
      .toBe('1 / kapasite tanımlı değil');
  });

  it('flags overflow from historical bad data', () => {
    const o = computeOccupancy([
      ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
      ev('s2', 'BOARDING', '2026-01-01T07:01:00Z'),
      ev('s3', 'BOARDING', '2026-01-01T07:02:00Z'),
    ], 2);
    expect(o.isOverflow).toBe(true);
    expect(o.overflowBy).toBe(1);
    expect(formatOccupancy(o)).toBe('3 / 2');
  });
});

describe('canBoardStudent', () => {
  const full = [
    ev('s1', 'BOARDING', '2026-01-01T07:00:00Z'),
    ev('s2', 'BOARDING', '2026-01-01T07:01:00Z'),
  ];

  it('blocks a new student when the vehicle is full', () => {
    const d = canBoardStudent(full, 2, 's3');
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('2/2');
  });

  it('allows a student who is already on board (idempotent)', () => {
    expect(canBoardStudent(full, 2, 's1').allowed).toBe(true);
  });

  it('allows boarding when capacity is unknown', () => {
    expect(canBoardStudent(full, null, 's3').allowed).toBe(true);
    expect(canBoardStudent(full, 0, 's3').allowed).toBe(true);
  });

  it('allows boarding again after someone disembarks', () => {
    const events = [...full, ev('s1', 'DISEMBARK', '2026-01-01T07:20:00Z')];
    expect(canBoardStudent(events, 2, 's3').allowed).toBe(true);
  });
});
