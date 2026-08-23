import { describe, it, expect } from 'vitest';
import {
  computeTripAlerts,
  detectLongStop,
  distanceToRouteCorridorMeters,
  pointToSegmentMeters,
  summarizeAlerts,
  worstSeverity,
  type PingSample,
  type TripSnapshot,
} from '@/lib/transport/safety';

const NOW = new Date('2026-03-02T08:00:00Z').getTime();
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

const baseTrip = (over: Partial<TripSnapshot> = {}): TripSnapshot => ({
  id: 't1',
  route_id: 'r1',
  started_at: ago(1800),
  last_lat: 39.92,
  last_lng: 32.85,
  last_accuracy: 12,
  last_location_at: ago(30),
  ...over,
});

const types = (t: TripSnapshot, extra: Partial<Parameters<typeof computeTripAlerts>[0]> = {}) =>
  computeTripAlerts({ trip: t, now: NOW, ...extra }).map(a => a.type);

describe('GPS alerts', () => {
  it('no alert within grace period when no fix yet', () => {
    const t = baseTrip({ started_at: ago(60), last_lat: null, last_lng: null, last_location_at: null });
    expect(types(t)).toEqual([]);
  });

  it('critical GPS_LOST when no fix after grace', () => {
    const t = baseTrip({ started_at: ago(900), last_lat: null, last_lng: null, last_location_at: null });
    const a = computeTripAlerts({ trip: t, now: NOW });
    expect(a).toHaveLength(1);
    expect(a[0].type).toBe('GPS_LOST');
    expect(a[0].severity).toBe('critical');
  });

  it('high GPS_LOST for stale fix, critical when very old', () => {
    expect(computeTripAlerts({ trip: baseTrip({ last_location_at: ago(240) }), now: NOW })[0].severity).toBe('high');
    expect(computeTripAlerts({ trip: baseTrip({ last_location_at: ago(1200) }), now: NOW })[0].severity).toBe('critical');
  });

  it('fresh accurate fix produces no alert', () => {
    expect(types(baseTrip())).toEqual([]);
  });

  it('POOR_GPS when accuracy above threshold', () => {
    expect(types(baseTrip({ last_accuracy: 250 }))).toContain('POOR_GPS');
  });
});

describe('long stop detection', () => {
  const still: PingSample[] = Array.from({ length: 10 }, (_, i) => ({
    lat: 39.92 + i * 0.00002,
    lng: 32.85,
    recorded_at: ago(600 - i * 60),
  }));
  const moving: PingSample[] = Array.from({ length: 10 }, (_, i) => ({
    lat: 39.92 + i * 0.004,
    lng: 32.85,
    recorded_at: ago(600 - i * 60),
  }));

  it('detects a vehicle stationary for >= 5 min', () => {
    const r = detectLongStop(still, NOW);
    expect(r.stopped).toBe(true);
    expect(r.seconds).toBeGreaterThanOrEqual(300);
  });

  it('does not flag a moving vehicle', () => {
    expect(detectLongStop(moving, NOW).stopped).toBe(false);
  });

  it('needs at least two samples', () => {
    expect(detectLongStop([still[0]], NOW).stopped).toBe(false);
  });

  it('LONG_STOP suppressed when fix is stale', () => {
    expect(types(baseTrip({ last_location_at: ago(400) }), { pings: still })).not.toContain('LONG_STOP');
  });

  it('LONG_STOP suppressed when accuracy is poor', () => {
    expect(types(baseTrip({ last_accuracy: 300 }), { pings: still })).not.toContain('LONG_STOP');
  });

  it('LONG_STOP raised with fresh accurate fix', () => {
    expect(types(baseTrip(), { pings: still })).toContain('LONG_STOP');
  });
});

describe('route corridor', () => {
  const stops = [
    { lat: 39.92, lng: 32.85, order_index: 1 },
    { lat: 39.93, lng: 32.86, order_index: 2 },
    { lat: 39.94, lng: 32.87, order_index: 3 },
  ];

  it('point on the segment has ~zero distance', () => {
    expect(pointToSegmentMeters({ lat: 39.92, lng: 32.85 }, stops[0], stops[1])).toBeLessThan(1);
  });

  it('returns null with insufficient geometry', () => {
    expect(distanceToRouteCorridorMeters({ lat: 39.92, lng: 32.85 }, [stops[0]])).toBeNull();
    expect(distanceToRouteCorridorMeters({ lat: 39.92, lng: 32.85 }, [])).toBeNull();
  });

  it('near-corridor point is under the deviation threshold', () => {
    const d = distanceToRouteCorridorMeters({ lat: 39.9251, lng: 32.8551 }, stops) as number;
    expect(d).toBeLessThan(400);
  });

  it('far point exceeds threshold and raises ROUTE_DEVIATION', () => {
    const far = { lat: 39.98, lng: 32.95 };
    expect(distanceToRouteCorridorMeters(far, stops) as number).toBeGreaterThan(400);
    expect(types(baseTrip({ last_lat: far.lat, last_lng: far.lng }), { stops })).toContain('ROUTE_DEVIATION');
  });

  it('no deviation alert without enough stop coordinates', () => {
    expect(types(baseTrip({ last_lat: 39.98, last_lng: 32.95 }), { stops: [stops[0]] })).not.toContain(
      'ROUTE_DEVIATION',
    );
  });

  it('deviation suppressed when fix is stale', () => {
    expect(
      types(baseTrip({ last_lat: 39.98, last_lng: 32.95, last_location_at: ago(500) }), { stops }),
    ).not.toContain('ROUTE_DEVIATION');
  });
});

describe('summary helpers', () => {
  it('summarizes and ranks severities', () => {
    const alerts = computeTripAlerts({
      trip: baseTrip({ last_lat: 39.98, last_lng: 32.95, last_location_at: ago(1200) }),
      stops: [
        { lat: 39.92, lng: 32.85, order_index: 1 },
        { lat: 39.93, lng: 32.86, order_index: 2 },
      ],
      now: NOW,
    });
    const s = summarizeAlerts(alerts);
    expect(s.gpsLost).toBe(1);
    expect(s.criticalOrHigh).toBeGreaterThanOrEqual(1);
    expect(worstSeverity(alerts)).toBe('critical');
  });

  it('worstSeverity is null for no alerts', () => {
    expect(worstSeverity([])).toBeNull();
  });
});

describe('capacity alerts', () => {
  const base = {
    id: 't1', route_id: 'r1', started_at: new Date().toISOString(),
    last_lat: 39.9, last_lng: 32.8, last_accuracy: 10,
    last_location_at: new Date().toISOString(),
  };
  it('raises a critical alert when occupancy exceeds capacity', () => {
    const alerts = computeTripAlerts({ trip: base, occupancy: { count: 5, capacity: 4 } });
    const cap = alerts.find(a => a.type === 'CAPACITY_EXCEEDED');
    expect(cap?.severity).toBe('critical');
    expect(summarizeAlerts(alerts).capacityExceeded).toBe(1);
  });
  it('does not alert at or below capacity, or without capacity', () => {
    expect(computeTripAlerts({ trip: base, occupancy: { count: 4, capacity: 4 } })
      .some(a => a.type === 'CAPACITY_EXCEEDED')).toBe(false);
    expect(computeTripAlerts({ trip: base, occupancy: { count: 9, capacity: null } })
      .some(a => a.type === 'CAPACITY_EXCEEDED')).toBe(false);
  });
});
