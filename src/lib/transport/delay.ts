/**
 * Reliable, direction-aware delay estimation for active transport trips.
 *
 * Everything here is derived from data that really exists:
 *  - `transport_trips` (direction + last GPS fix)
 *  - `route_stops.planned_to_school` / `route_stops.planned_to_home`
 *    (optional, admin-entered local Europe/Istanbul pass times)
 *  - the existing conservative ETA helper (haversine + GPS speed)
 *
 * Nothing is fabricated: if a direction has no planned time, or the GPS fix is
 * stale, or the ETA cannot be produced, NO delay is reported.
 *
 * The legacy `route_stops.planned_time` column is deliberately IGNORED — it is
 * direction-agnostic and therefore ambiguous for a `both` route.
 */

import { estimateEta, haversineMeters, type LatLng } from './eta';

export const DELAY_GRACE_MINUTES = 5;
/** Delay above this is reported as `high` severity instead of `warning`. */
export const DELAY_HIGH_MINUTES = 15;
/** Vehicle within this radius of a stop is treated as having reached it. */
export const STOP_REACHED_RADIUS_M = 75;
export const SERVICE_TIMEZONE = 'Europe/Istanbul';

export type PlanDirection = 'to_school' | 'to_home';

export interface PlannedStop {
  name?: string | null;
  order_index: number;
  lat: number | null;
  lng: number | null;
  planned_to_school?: string | null;
  planned_to_home?: string | null;
}

export interface DelayTrip {
  id: string;
  direction: string;
  last_lat: number | null;
  last_lng: number | null;
  last_speed?: number | null;
  last_location_at: string | null;
}

export type DelaySkipReason =
  | 'ambiguous_direction'
  | 'no_location'
  | 'stale_location'
  | 'no_planned_stop'
  | 'eta_unavailable'
  | 'on_time';

export interface DelayResult {
  delayed: boolean;
  reason?: DelaySkipReason;
  /** Estimated minutes late (only when `delayed`). */
  delayMinutes?: number;
  etaMinutes?: number;
  stopName?: string;
  plannedLocalTime?: string;
  severity?: 'high' | 'warning';
}

/** Milliseconds a timezone is offset from UTC at the given instant. */
function timeZoneOffsetMs(epochMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(epochMs)).map(p => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - epochMs;
}

/** Parses `HH:MM` / `HH:MM:SS` into seconds of day, or null. */
export function parsePlannedTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

/**
 * Resolves a local planned time to the epoch instant on the *service day*
 * closest to `now` — so 23:50 vs 00:10 never lands on the wrong day.
 */
export function plannedEpochMs(
  plannedSecondsOfDay: number,
  now: number,
  timeZone: string = SERVICE_TIMEZONE,
): number {
  const offset = timeZoneOffsetMs(now, timeZone);
  const localNow = now + offset;
  const localMidnight = Math.floor(localNow / 86400000) * 86400000;
  let candidate = localMidnight + plannedSecondsOfDay * 1000 - offset;
  const halfDay = 12 * 3600 * 1000;
  if (candidate - now > halfDay) candidate -= 86400000;
  else if (now - candidate > halfDay) candidate += 86400000;
  return candidate;
}

export function planDirectionOf(direction: string): PlanDirection | null {
  return direction === 'to_school' || direction === 'to_home' ? direction : null;
}

function plannedFor(stop: PlannedStop, dir: PlanDirection): string | null | undefined {
  return dir === 'to_school' ? stop.planned_to_school : stop.planned_to_home;
}

/**
 * Deterministically picks the upcoming stop: candidates (coordinates + planned
 * time for this direction) ordered by `order_index`; the nearest one is chosen,
 * and if the vehicle is already at it, the following candidate is used.
 * Straight-line distance only — no claim of real road geometry.
 */
export function pickUpcomingStop(
  vehicle: LatLng,
  stops: PlannedStop[],
  dir: PlanDirection,
): { stop: PlannedStop; plannedSeconds: number } | null {
  const candidates = stops
    .filter(s => Number.isFinite(s.lat as number) && Number.isFinite(s.lng as number))
    .filter(s => parsePlannedTime(plannedFor(s, dir)) != null)
    .sort((a, b) => a.order_index - b.order_index);
  if (!candidates.length) return null;

  let bestIdx = 0;
  let bestDist = Infinity;
  candidates.forEach((s, i) => {
    const d = haversineMeters(vehicle, { lat: s.lat as number, lng: s.lng as number });
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  });
  let idx = bestIdx;
  if (bestDist <= STOP_REACHED_RADIUS_M && bestIdx < candidates.length - 1) idx = bestIdx + 1;
  const stop = candidates[idx];
  return { stop, plannedSeconds: parsePlannedTime(plannedFor(stop, dir)) as number };
}

export interface DelayInput {
  trip: DelayTrip;
  stops: PlannedStop[];
  now?: number;
  graceMinutes?: number;
  timeZone?: string;
}

export function computeTripDelay(input: DelayInput): DelayResult {
  const {
    trip,
    stops,
    now = Date.now(),
    graceMinutes = DELAY_GRACE_MINUTES,
    timeZone = SERVICE_TIMEZONE,
  } = input;

  const dir = planDirectionOf(trip.direction);
  if (!dir) return { delayed: false, reason: 'ambiguous_direction' };
  if (trip.last_lat == null || trip.last_lng == null || !trip.last_location_at) {
    return { delayed: false, reason: 'no_location' };
  }

  const vehicle = { lat: trip.last_lat, lng: trip.last_lng };
  const picked = pickUpcomingStop(vehicle, stops, dir);
  if (!picked) return { delayed: false, reason: 'no_planned_stop' };

  const eta = estimateEta({
    vehicle,
    stop: { lat: picked.stop.lat as number, lng: picked.stop.lng as number },
    lastLocationAt: trip.last_location_at,
    lastSpeedMs: trip.last_speed ?? null,
    now,
  });
  if (!eta.available) {
    return { delayed: false, reason: eta.reason === 'stale_location' ? 'stale_location' : 'eta_unavailable' };
  }

  const plannedAt = plannedEpochMs(picked.plannedSeconds, now, timeZone);
  const arrivalAt = now + (eta.etaSeconds as number) * 1000;
  const delayMinutes = Math.round((arrivalAt - plannedAt) / 60000);
  if (!Number.isFinite(delayMinutes) || delayMinutes <= graceMinutes) {
    return { delayed: false, reason: 'on_time' };
  }

  const hh = Math.floor(picked.plannedSeconds / 3600).toString().padStart(2, '0');
  const mm = Math.floor((picked.plannedSeconds % 3600) / 60).toString().padStart(2, '0');

  return {
    delayed: true,
    delayMinutes,
    etaMinutes: eta.etaMinutes,
    stopName: picked.stop.name || 'Durak',
    plannedLocalTime: `${hh}:${mm}`,
    severity: delayMinutes >= DELAY_HIGH_MINUTES ? 'high' : 'warning',
  };
}
