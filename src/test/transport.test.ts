import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  estimateEta,
  effectiveSpeedKmh,
  DEFAULT_CITY_SPEED_KMH,
  formatDistance,
} from '@/lib/transport/eta';
import {
  absenceCoversDirection,
  findActiveAbsence,
  toDateKey,
  TransportAbsence,
} from '@/lib/transport/absences';

const NOW = new Date('2026-08-23T08:00:00.000Z').getTime();
const fresh = new Date(NOW - 20_000).toISOString();
const stale = new Date(NOW - 15 * 60_000).toISOString();

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters({ lat: 39.92, lng: 32.85 }, { lat: 39.92, lng: 32.85 })).toBe(0);
  });

  it('approximates a known short distance (~1.11 km per 0.01 lat)', () => {
    const d = haversineMeters({ lat: 39.92, lng: 32.85 }, { lat: 39.93, lng: 32.85 });
    expect(d).toBeGreaterThan(1090);
    expect(d).toBeLessThan(1130);
  });
});

describe('effectiveSpeedKmh', () => {
  it('falls back to the conservative default for missing/implausible speeds', () => {
    expect(effectiveSpeedKmh(null)).toBe(DEFAULT_CITY_SPEED_KMH);
    expect(effectiveSpeedKmh(0.2)).toBe(DEFAULT_CITY_SPEED_KMH);
    expect(effectiveSpeedKmh(80)).toBe(DEFAULT_CITY_SPEED_KMH);
  });

  it('trusts plausible GPS speeds', () => {
    expect(effectiveSpeedKmh(10)).toBeCloseTo(36, 5);
  });
});

describe('estimateEta', () => {
  const stop = { lat: 39.93, lng: 32.85 };
  const vehicle = { lat: 39.92, lng: 32.85 };

  it('is unavailable without location or stop', () => {
    expect(estimateEta({ vehicle: null, stop, lastLocationAt: fresh, now: NOW }).reason).toBe('no_location');
    expect(estimateEta({ vehicle, stop: null, lastLocationAt: fresh, now: NOW }).reason).toBe('no_stop');
  });

  it('is unavailable when the location is stale', () => {
    const r = estimateEta({ vehicle, stop, lastLocationAt: stale, now: NOW });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('stale_location');
  });

  it('produces an approximate eta with the default speed', () => {
    const r = estimateEta({ vehicle, stop, lastLocationAt: fresh, lastSpeedMs: null, now: NOW });
    expect(r.available).toBe(true);
    expect(r.usedGpsSpeed).toBe(false);
    expect(r.speedKmh).toBe(DEFAULT_CITY_SPEED_KMH);
    expect(r.etaMinutes).toBeGreaterThan(0);
    expect(r.label).toContain('yaklaşık');
  });

  it('flags approaching within ~1 km', () => {
    const near = estimateEta({ vehicle: { lat: 39.9255, lng: 32.85 }, stop, lastLocationAt: fresh, now: NOW });
    expect(near.approaching).toBe(true);
    const far = estimateEta({ vehicle: { lat: 39.80, lng: 32.85 }, stop, lastLocationAt: fresh, lastSpeedMs: 12, now: NOW });
    expect(far.approaching).toBe(false);
  });
});

describe('formatDistance', () => {
  it('switches between meters and kilometers', () => {
    expect(formatDistance(340)).toBe('340 m');
    expect(formatDistance(2500)).toBe('2.5 km');
  });
});

describe('absence direction matching', () => {
  it('full day covers every direction', () => {
    expect(absenceCoversDirection('both', 'to_school')).toBe(true);
    expect(absenceCoversDirection('both', 'to_home')).toBe(true);
  });

  it('morning notice does not cover the return trip', () => {
    expect(absenceCoversDirection('to_school', 'to_home')).toBe(false);
    expect(absenceCoversDirection('to_school', 'to_school')).toBe(true);
    expect(absenceCoversDirection('to_home', 'to_school')).toBe(false);
  });

  it('a both-direction trip is covered by any notice', () => {
    expect(absenceCoversDirection('to_home', 'both')).toBe(true);
  });
});

describe('findActiveAbsence', () => {
  const base: TransportAbsence = {
    id: '1', institution_id: 'i', student_id: 's1', absence_date: '2026-08-23',
    direction: 'to_school', reason: null, cancelled_at: null, deleted_at: null,
    created_at: '2026-08-22T10:00:00Z',
  };

  it('matches student, date and direction', () => {
    expect(findActiveAbsence([base], 's1', '2026-08-23', 'to_school')?.id).toBe('1');
    expect(findActiveAbsence([base], 's1', '2026-08-23', 'to_home')).toBeNull();
    expect(findActiveAbsence([base], 's2', '2026-08-23', 'to_school')).toBeNull();
    expect(findActiveAbsence([base], 's1', '2026-08-24', 'to_school')).toBeNull();
  });

  it('ignores cancelled and soft-deleted rows', () => {
    expect(findActiveAbsence([{ ...base, cancelled_at: '2026-08-22T12:00:00Z' }], 's1', '2026-08-23', 'to_school')).toBeNull();
    expect(findActiveAbsence([{ ...base, deleted_at: '2026-08-22T12:00:00Z' }], 's1', '2026-08-23', 'to_school')).toBeNull();
  });
});

describe('toDateKey', () => {
  it('formats a local calendar day', () => {
    expect(toDateKey(new Date(2026, 7, 5))).toBe('2026-08-05');
  });
});
