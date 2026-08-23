/**
 * Location provider abstraction.
 *
 * V1 only ships the browser Geolocation provider (driver's phone, screen on).
 * A native app bridge or a vehicle GPS hardware provider can implement the same
 * interface later without touching the trip/ping persistence code.
 */

export interface LocationSample {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
  source: string;
}

export type LocationErrorCode = 'permission_denied' | 'unavailable' | 'timeout' | 'unsupported';

export interface LocationProviderError {
  code: LocationErrorCode;
  message: string;
}

export interface LocationProvider {
  readonly id: string;
  isSupported(): boolean;
  start(
    onSample: (sample: LocationSample) => void,
    onError: (error: LocationProviderError) => void,
  ): void;
  stop(): void;
}

const ERROR_MESSAGES: Record<LocationErrorCode, string> = {
  permission_denied:
    'Konum izni verilmedi. Tarayıcı ayarlarından bu site için konum iznini açıp tekrar deneyin.',
  unavailable: 'Konum bilgisi alınamıyor. GPS sinyali zayıf olabilir.',
  timeout: 'Konum alınamadı (zaman aşımı). Tekrar deneniyor...',
  unsupported: 'Bu tarayıcı konum servisini desteklemiyor.',
};

export class BrowserGeolocationProvider implements LocationProvider {
  readonly id = 'browser';
  private watchId: number | null = null;

  isSupported() {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  start(
    onSample: (sample: LocationSample) => void,
    onError: (error: LocationProviderError) => void,
  ) {
    if (!this.isSupported()) {
      onError({ code: 'unsupported', message: ERROR_MESSAGES.unsupported });
      return;
    }
    this.stop();
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onSample({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          timestamp: pos.timestamp,
          source: this.id,
        });
      },
      (err) => {
        const code: LocationErrorCode =
          err.code === err.PERMISSION_DENIED
            ? 'permission_denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        onError({ code, message: ERROR_MESSAGES[code] });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

/** Haversine distance in meters. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
