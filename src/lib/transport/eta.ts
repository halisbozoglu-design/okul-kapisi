/**
 * Conservative, dependency-free ETA estimation for the transport module.
 * No external / paid routing API: straight-line (haversine) distance combined
 * with either the vehicle's recent GPS speed or a conservative urban default.
 * Results are ALWAYS approximate and must be labelled as such in the UI.
 */

export interface LatLng { lat: number; lng: number }

/** Default conservative in-city average speed (km/h) when GPS speed is unusable. */
export const DEFAULT_CITY_SPEED_KMH = 22;
/** GPS speed is only trusted between these bounds (m/s). */
const MIN_TRUSTED_SPEED_MS = 2;      // ~7 km/h
const MAX_TRUSTED_SPEED_MS = 27.8;   // ~100 km/h
/** Location older than this is considered stale — no ETA is shown. */
export const MAX_LOCATION_AGE_SECONDS = 180;
/** Road factor: straight-line distance underestimates real driving distance. */
const ROAD_FACTOR = 1.35;
/** "Approaching" thresholds. */
export const APPROACHING_DISTANCE_M = 1000;
export const APPROACHING_ETA_SECONDS = 300;

const R = 6371000;
const toRad = (v: number) => (v * Math.PI) / 180;

/** Great-circle distance in meters between two coordinates. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Chooses a usable speed in km/h from the last GPS sample. */
export function effectiveSpeedKmh(lastSpeedMs: number | null | undefined): number {
  if (
    typeof lastSpeedMs === 'number' &&
    Number.isFinite(lastSpeedMs) &&
    lastSpeedMs >= MIN_TRUSTED_SPEED_MS &&
    lastSpeedMs <= MAX_TRUSTED_SPEED_MS
  ) {
    return lastSpeedMs * 3.6;
  }
  return DEFAULT_CITY_SPEED_KMH;
}

export interface EtaInput {
  vehicle: LatLng | null;
  stop: LatLng | null;
  /** ISO timestamp of the last known vehicle location. */
  lastLocationAt: string | null;
  /** Raw GPS speed in m/s from the last sample. */
  lastSpeedMs?: number | null;
  /** Injectable clock for tests (ms epoch). */
  now?: number;
}

export interface EtaResult {
  available: boolean;
  /** Reason the ETA could not be produced. */
  reason?: 'no_location' | 'no_stop' | 'stale_location';
  distanceMeters?: number;
  etaSeconds?: number;
  etaMinutes?: number;
  speedKmh?: number;
  /** Whether the GPS speed was trusted (false = conservative default used). */
  usedGpsSpeed?: boolean;
  approaching?: boolean;
  /** Human readable, explicitly approximate. */
  label?: string;
}

export function estimateEta(input: EtaInput): EtaResult {
  const { vehicle, stop, lastLocationAt, lastSpeedMs, now = Date.now() } = input;
  if (!vehicle || vehicle.lat == null || vehicle.lng == null || !lastLocationAt) {
    return { available: false, reason: 'no_location' };
  }
  if (!stop || stop.lat == null || stop.lng == null) {
    return { available: false, reason: 'no_stop' };
  }
  const ageSeconds = (now - new Date(lastLocationAt).getTime()) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_LOCATION_AGE_SECONDS) {
    return { available: false, reason: 'stale_location' };
  }

  const distanceMeters = haversineMeters(vehicle, stop) * ROAD_FACTOR;
  const speedKmh = effectiveSpeedKmh(lastSpeedMs);
  const usedGpsSpeed = speedKmh !== DEFAULT_CITY_SPEED_KMH;
  const etaSeconds = distanceMeters / (speedKmh / 3.6);
  const etaMinutes = Math.max(1, Math.round(etaSeconds / 60));
  const approaching =
    distanceMeters <= APPROACHING_DISTANCE_M || etaSeconds <= APPROACHING_ETA_SECONDS;

  return {
    available: true,
    distanceMeters,
    etaSeconds,
    etaMinutes,
    speedKmh,
    usedGpsSpeed,
    approaching,
    label: `yaklaşık ${etaMinutes} dk`,
  };
}

/** Formats distance for compact mobile display. */
export function formatDistance(meters: number): string {
  return meters < 950 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
