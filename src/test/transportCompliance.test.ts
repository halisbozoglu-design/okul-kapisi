import { describe, expect, it } from 'vitest';
import {
  canStartTransportTrip,
  daysUntilExpiry,
  evaluateTransportCompliance,
  hasExpired,
} from '@/lib/transportCompliance';

describe('transport compliance engine', () => {
  it('blocks when a required legal check is failed or unknown', () => {
    const result = evaluateTransportCompliance([
      { code: 'driver', label: 'Şoför uygunluğu', severity: 'required', passed: true },
      { code: 'inspection', label: 'Muayene', severity: 'required', passed: null },
    ], '2026-08-24T00:00:00.000Z');

    expect(result.decision).toBe('BLOKE');
    expect(result.blocking.map(x => x.code)).toEqual(['inspection']);
    expect(canStartTransportTrip(result)).toBe(false);
  });

  it('returns conditional when only conditional evidence is missing', () => {
    const result = evaluateTransportCompliance([
      { code: 'vehicle', label: 'Araç uygunluğu', severity: 'required', passed: true },
      { code: 'guide', label: 'Rehber personel', severity: 'conditional', passed: null },
    ]);

    expect(result.decision).toBe('KOSULLU');
    expect(canStartTransportTrip(result)).toBe(true);
  });

  it('keeps warnings non-blocking', () => {
    const result = evaluateTransportCompliance([
      { code: 'docs', label: 'Belgeler', severity: 'required', passed: true },
      { code: 'warning', label: 'Yaklaşan süre', severity: 'warning', passed: false },
    ]);

    expect(result.decision).toBe('UYGUN');
    expect(result.warnings).toHaveLength(1);
  });

  it('evaluates expiry helpers deterministically', () => {
    const now = new Date('2026-08-24T00:00:00.000Z');
    expect(hasExpired('2026-08-23T23:59:59.000Z', now)).toBe(true);
    expect(hasExpired('2026-08-25T00:00:00.000Z', now)).toBe(false);
    expect(daysUntilExpiry('2026-08-25T00:00:00.000Z', now)).toBe(1);
  });
});
