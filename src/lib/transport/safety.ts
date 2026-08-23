/**
 * Derived operational safety alerts for active transport trips.
 *
 * Everything here is a PURE function computed from data that already exists
 * (`transport_trips`, `location_pings`, `route_stops`). No new table, no
 * persistence, no duplicate bookkeeping — alerts are re-derived on every render.
 *
 * Deliberately NOT implemented: a "DELAYED" alert. There is no reliable planned
 * schedule for a trip in the current schema (`route_stops.planned_time` is
 * optional per-stop and not tied to a trip start), so any delay figure would be
 * fabricated.
 */

import { haversineMeters, type LatLng } from './eta';

export type SafetyAlertType = 'GPS_LOST' | 'POOR_GPS' | 'LONG_STOP' | 'ROUTE_DEVIATION';
export type SafetySeverity = 'critical' | 'high' | 'warning';

export interface SafetyAlert {
  tripId: string;
  type: SafetyAlertType;
  severity: SafetySeverity;
  title: string;
  detail: string;
}

/** Time after trip start before a missing fix counts as an alert. */
export const GPS_GRACE_SECONDS = 120;
/** Location older than this is stale. */
export const GPS_STALE_SECONDS = 180;
/** Location older than this is treated as fully lost (critical). */
export const GPS_LOST_SECONDS = 600;
/** Accuracy worse than this (meters) is unreliable. */
export const POOR_ACCURACY_M = 100;
/** Long-stop detection window / radius / minimum duration. */
export const LONG_STOP_RADIUS_M = 50;
export const LONG_STOP_MIN_SECONDS = 300;
/** Distance from the approximate stop corridor before deviation is reported. */
export const ROUTE_DEVIATION_M = 400;

export interface TripSnapshot {
  id: string;
  route_id: string;
  started_at: string;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_location_at: string | null;
}

export interface PingSample {
  lat: number;
  lng: number;
  recorded_at: string;
}

export interface StopCoord extends LatLng {
  order_index: number;
}

const secondsSince = (iso: string | null, now: number) =>
  iso ? (now - new Date(iso).getTime()) / 1000 : null;

/** Shortest distance (m) from point `p` to segment `a`-`b`, planar approximation. */
export function pointToSegmentMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return haversineMeters(p, a);
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - bx * t;
  const dy = py - by * t;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance from the *approximate* corridor built by joining consecutive stops
 * in order. This is a straight-line approximation, not real road geometry.
 * Returns null when there is not enough geometry (< 2 usable stops).
 */
export function distanceToRouteCorridorMeters(p: LatLng, stops: StopCoord[]): number | null {
  const usable = stops
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .sort((a, b) => a.order_index - b.order_index);
  if (usable.length < 2) return null;
  let min = Infinity;
  for (let i = 0; i < usable.length - 1; i++) {
    min = Math.min(min, pointToSegmentMeters(p, usable[i], usable[i + 1]));
  }
  return min;
}

/** True when every sampled ping in the trailing window stays inside a small radius. */
export function detectLongStop(
  pings: PingSample[],
  now: number,
  radiusM = LONG_STOP_RADIUS_M,
  minSeconds = LONG_STOP_MIN_SECONDS,
): { stopped: boolean; seconds: number } {
  if (pings.length < 2) return { stopped: false, seconds: 0 };
  const sorted = [...pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const last = sorted[sorted.length - 1];
  const anchor = { lat: last.lat, lng: last.lng };
  let startIdx = sorted.length - 1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (haversineMeters(anchor, sorted[i]) > radiusM) break;
    startIdx = i;
  }
  const seconds =
    (new Date(last.recorded_at).getTime() - new Date(sorted[startIdx].recorded_at).getTime()) / 1000;
  if (startIdx === sorted.length - 1) return { stopped: false, seconds: 0 };
  return { stopped: seconds >= minSeconds, seconds };
}

export interface SafetyInput {
  trip: TripSnapshot;
  pings?: PingSample[];
  stops?: StopCoord[];
  now?: number;
}

export function computeTripAlerts(input: SafetyInput): SafetyAlert[] {
  const { trip, pings = [], stops = [], now = Date.now() } = input;
  const alerts: SafetyAlert[] = [];
  const tripId = trip.id;

  const ageS = secondsSince(trip.last_location_at, now);
  const sinceStartS = secondsSince(trip.started_at, now) ?? 0;
  const hasFix = trip.last_lat != null && trip.last_lng != null && ageS != null;

  // --- GPS_LOST -------------------------------------------------------------
  if (!hasFix) {
    if (sinceStartS > GPS_GRACE_SECONDS) {
      alerts.push({
        tripId,
        type: 'GPS_LOST',
        severity: 'critical',
        title: 'GPS konumu yok',
        detail: `Sefer ${Math.round(sinceStartS / 60)} dk önce başladı, hiç konum alınamadı.`,
      });
    }
    return alerts; // nothing else can be trusted without a fix
  }

  const stale = (ageS as number) > GPS_STALE_SECONDS;
  if (stale) {
    alerts.push({
      tripId,
      type: 'GPS_LOST',
      severity: (ageS as number) > GPS_LOST_SECONDS ? 'critical' : 'high',
      title: 'GPS konumu eski',
      detail: `Son konum ${Math.round((ageS as number) / 60)} dk önce alındı.`,
    });
  }

  // --- POOR_GPS -------------------------------------------------------------
  const poorAccuracy = trip.last_accuracy != null && trip.last_accuracy > POOR_ACCURACY_M;
  if (poorAccuracy) {
    alerts.push({
      tripId,
      type: 'POOR_GPS',
      severity: 'warning',
      title: 'GPS doğruluğu düşük',
      detail: `Konum hassasiyeti ±${Math.round(trip.last_accuracy as number)} m. Konum yaklaşık.`,
    });
  }

  // --- LONG_STOP ------------------------------------------------------------
  // Suppressed when the fix is stale (that is a GPS problem, not a stop) or
  // when accuracy is too poor for a 50 m radius to mean anything.
  if (!stale && !poorAccuracy) {
    const { stopped, seconds } = detectLongStop(pings, now);
    if (stopped) {
      alerts.push({
        tripId,
        type: 'LONG_STOP',
        severity: 'warning',
        title: 'Uzun süreli durma',
        detail: `Araç yaklaşık ${Math.round(seconds / 60)} dk boyunca aynı noktada.`,
      });
    }
  }

  // --- ROUTE_DEVIATION ------------------------------------------------------
  // Approximate stop corridor only; never claimed as real road geometry.
  if (!stale && !poorAccuracy) {
    const dist = distanceToRouteCorridorMeters(
      { lat: trip.last_lat as number, lng: trip.last_lng as number },
      stops,
    );
    if (dist != null && dist > ROUTE_DEVIATION_M) {
      alerts.push({
        tripId,
        type: 'ROUTE_DEVIATION',
        severity: 'high',
        title: 'Yaklaşık güzergâhtan sapma',
        detail: `Araç durak koridorundan yaklaşık ${Math.round(dist)} m uzakta (yaklaşık hesap).`,
      });
    }
  }

  return alerts;
}

export const SEVERITY_ORDER: Record<SafetySeverity, number> = {
  critical: 0,
  high: 1,
  warning: 2,
};

export function worstSeverity(alerts: SafetyAlert[]): SafetySeverity | null {
  if (!alerts.length) return null;
  return [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0]
    .severity;
}

export interface AlertSummary {
  total: number;
  criticalOrHigh: number;
  gpsLost: number;
  longStop: number;
  routeDeviation: number;
  poorGps: number;
}

export function summarizeAlerts(alerts: SafetyAlert[]): AlertSummary {
  return {
    total: alerts.length,
    criticalOrHigh: alerts.filter(a => a.severity !== 'warning').length,
    gpsLost: alerts.filter(a => a.type === 'GPS_LOST').length,
    longStop: alerts.filter(a => a.type === 'LONG_STOP').length,
    routeDeviation: alerts.filter(a => a.type === 'ROUTE_DEVIATION').length,
    poorGps: alerts.filter(a => a.type === 'POOR_GPS').length,
  };
}
