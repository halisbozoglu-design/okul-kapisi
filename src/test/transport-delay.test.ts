import { describe, it, expect } from 'vitest';
import {
  computeTripDelay,
  parsePlannedTime,
  plannedEpochMs,
  pickUpcomingStop,
  planDirectionOf,
} from '@/lib/transport/delay';
import { computeTripAlerts, summarizeAlerts } from '@/lib/transport/safety';

// Istanbul is UTC+3 all year.
const localIso = (hhmm: string, day = '2026-05-11') => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(
    Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)),
    h - 3, m,
  )).getTime();
};

const stopFar = {
  name: 'Merkez',
  order_index: 1,
  lat: 41.0,
  lng: 29.0,
  planned_to_school: '08:00:00',
  planned_to_home: '16:00:00',
};
// ~4.5 km away → ~6 km road distance → ~16 dk at 22 km/h
const vehicleFar = { lat: 41.04, lng: 29.0 };

const trip = (over: Partial<Parameters<typeof computeTripDelay>[0]['trip']> = {}, nowMs = 0) => ({
  id: 't1',
  direction: 'to_school',
  last_lat: vehicleFar.lat,
  last_lng: vehicleFar.lng,
  last_speed: null,
  last_location_at: new Date(nowMs).toISOString(),
  ...over,
});

describe('planned time parsing / local day handling', () => {
  it('parses HH:MM and HH:MM:SS, rejects junk', () => {
    expect(parsePlannedTime('08:05')).toBe(8 * 3600 + 300);
    expect(parsePlannedTime('08:05:30')).toBe(8 * 3600 + 330);
    expect(parsePlannedTime(null)).toBeNull();
    expect(parsePlannedTime('99:99')).toBeNull();
  });

  it('resolves planned time on the same Istanbul service day', () => {
    const now = localIso('07:50');
    expect(plannedEpochMs(8 * 3600, now)).toBe(localIso('08:00'));
  });

  it('handles the midnight edge without NaN or wrong day', () => {
    const now = localIso('00:10', '2026-05-12');
    const planned = plannedEpochMs(23 * 3600 + 50 * 60, now); // 23:50
    expect(Number.isFinite(planned)).toBe(true);
    expect(planned).toBe(localIso('23:50', '2026-05-11'));
    expect(Math.abs(now - planned)).toBeLessThan(12 * 3600 * 1000);
  });
});

describe('direction handling', () => {
  it('maps only unambiguous directions', () => {
    expect(planDirectionOf('to_school')).toBe('to_school');
    expect(planDirectionOf('to_home')).toBe('to_home');
    expect(planDirectionOf('both')).toBeNull();
  });

  it('produces no delay for a both-direction trip', () => {
    const now = localIso('09:00');
    const r = computeTripDelay({ trip: trip({ direction: 'both' }, now), stops: [stopFar], now });
    expect(r.delayed).toBe(false);
    expect(r.reason).toBe('ambiguous_direction');
  });

  it('uses the to_home column for return trips', () => {
    const now = localIso('16:30');
    const r = computeTripDelay({ trip: trip({ direction: 'to_home' }, now), stops: [stopFar], now });
    expect(r.delayed).toBe(true);
    expect(r.plannedLocalTime).toBe('16:00');
  });

  it('ignores stops that only have the other direction planned', () => {
    const now = localIso('16:30');
    const r = computeTripDelay({
      trip: trip({ direction: 'to_home' }, now),
      stops: [{ ...stopFar, planned_to_home: null }],
      now,
    });
    expect(r.reason).toBe('no_planned_stop');
  });
});

describe('reliability guards', () => {
  it('no planned time => no delay', () => {
    const now = localIso('09:00');
    const r = computeTripDelay({
      trip: trip({}, now),
      stops: [{ ...stopFar, planned_to_school: null, planned_to_home: null }],
      now,
    });
    expect(r.delayed).toBe(false);
    expect(r.reason).toBe('no_planned_stop');
  });

  it('stale GPS suppresses the delay', () => {
    const now = localIso('09:00');
    const r = computeTripDelay({
      trip: trip({ last_location_at: new Date(now - 10 * 60 * 1000).toISOString() }, now),
      stops: [stopFar],
      now,
    });
    expect(r.delayed).toBe(false);
    expect(r.reason).toBe('stale_location');
  });

  it('missing location suppresses the delay', () => {
    const now = localIso('09:00');
    const r = computeTripDelay({
      trip: trip({ last_lat: null, last_lng: null }, now),
      stops: [stopFar],
      now,
    });
    expect(r.reason).toBe('no_location');
  });

  it('stops without coordinates cannot produce an ETA-based delay', () => {
    const now = localIso('09:00');
    const r = computeTripDelay({
      trip: trip({}, now),
      stops: [{ ...stopFar, lat: null, lng: null }],
      now,
    });
    expect(r.reason).toBe('no_planned_stop');
  });
});

describe('delay computation', () => {
  it('on time => no alert', () => {
    const now = localIso('07:30'); // ~16 dk ETA, planned 08:00
    const r = computeTripDelay({ trip: trip({}, now), stops: [stopFar], now });
    expect(r.delayed).toBe(false);
    expect(r.reason).toBe('on_time');
  });

  it('inside the grace window => no alert', () => {
    const now = localIso('07:48'); // arrival ~08:04, grace 5 dk
    const r = computeTripDelay({ trip: trip({}, now), stops: [stopFar], now });
    expect(r.delayed).toBe(false);
  });

  it('beyond the grace window => delayed with minutes and stop name', () => {
    const now = localIso('08:00');
    const r = computeTripDelay({ trip: trip({}, now), stops: [stopFar], now });
    expect(r.delayed).toBe(true);
    expect(r.delayMinutes).toBeGreaterThan(5);
    expect(r.stopName).toBe('Merkez');
    expect(r.severity).toBe('high');
  });

  it('is deterministic for repeated calls', () => {
    const now = localIso('08:00');
    const a = computeTripDelay({ trip: trip({}, now), stops: [stopFar], now });
    const b = computeTripDelay({ trip: trip({}, now), stops: [stopFar], now });
    expect(a).toEqual(b);
  });

  it('picks the next stop when the vehicle already reached the nearest one', () => {
    const now = localIso('08:00');
    const stops = [
      { ...stopFar, name: 'A', order_index: 1, lat: 41.04, lng: 29.0 },
      { ...stopFar, name: 'B', order_index: 2 },
    ];
    const picked = pickUpcomingStop(vehicleFar, stops, 'to_school');
    expect(picked?.stop.name).toBe('B');
    expect(now).toBeGreaterThan(0);
  });
});

describe('safety integration', () => {
  const stopsInput = [stopFar, { ...stopFar, name: 'İkinci', order_index: 2, lat: 41.001, lng: 29.001 }];

  it('adds a DELAYED alert and counts it in the summary', () => {
    const now = localIso('08:00');
    const alerts = computeTripAlerts({
      trip: {
        id: 't1',
        route_id: 'r1',
        direction: 'to_school',
        started_at: new Date(now - 20 * 60 * 1000).toISOString(),
        last_lat: vehicleFar.lat,
        last_lng: vehicleFar.lng,
        last_accuracy: 12,
        last_speed: null,
        last_location_at: new Date(now).toISOString(),
      },
      stops: stopsInput,
      now,
    });
    expect(alerts.some(a => a.type === 'DELAYED')).toBe(true);
    expect(summarizeAlerts(alerts).delayed).toBe(1);
  });

  it('does not add DELAYED when the fix is stale (GPS_LOST wins)', () => {
    const now = localIso('08:00');
    const alerts = computeTripAlerts({
      trip: {
        id: 't1',
        route_id: 'r1',
        direction: 'to_school',
        started_at: new Date(now - 40 * 60 * 1000).toISOString(),
        last_lat: vehicleFar.lat,
        last_lng: vehicleFar.lng,
        last_accuracy: 12,
        last_speed: null,
        last_location_at: new Date(now - 15 * 60 * 1000).toISOString(),
      },
      stops: stopsInput,
      now,
    });
    expect(alerts.some(a => a.type === 'DELAYED')).toBe(false);
    expect(alerts.some(a => a.type === 'GPS_LOST')).toBe(true);
  });
});
