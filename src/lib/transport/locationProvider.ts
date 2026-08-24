import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capacitor-community/background-geolocation';

/** Location provider abstraction shared by PWA, Android and iOS. */
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
  stop(): void | Promise<void>;
}

const ERROR_MESSAGES: Record<LocationErrorCode, string> = {
  permission_denied:
    'Konum izni verilmedi. Cihaz ayarlarından MİMAROS için konum iznini açıp tekrar deneyin.',
  unavailable: 'Konum bilgisi alınamıyor. GPS sinyali zayıf olabilir.',
  timeout: 'Konum alınamadı (zaman aşımı). Tekrar deneniyor...',
  unsupported: 'Bu cihaz konum servisini desteklemiyor.',
};

/** Native Android/iOS background location provider. */
export class NativeBackgroundLocationProvider implements LocationProvider {
  readonly id = 'native-background';
  private watcherId: string | null = null;

  isSupported() {
    return Capacitor.isNativePlatform();
  }

  start(
    onSample: (sample: LocationSample) => void,
    onError: (error: LocationProviderError) => void,
  ) {
    if (!this.isSupported()) {
      onError({ code: 'unsupported', message: ERROR_MESSAGES.unsupported });
      return;
    }

    void this.stop().finally(async () => {
      try {
        this.watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'MİMAROS servis konumunu sefer boyunca paylaşıyor.',
            backgroundTitle: 'MİMAROS servis takibi aktif',
            requestPermissions: true,
            stale: false,
            distanceFilter: 10,
          },
          (location, error) => {
            if (error) {
              const denied = String(error.code ?? '').toUpperCase().includes('DENIED');
              onError({
                code: denied ? 'permission_denied' : 'unavailable',
                message: denied ? ERROR_MESSAGES.permission_denied : (error.message || ERROR_MESSAGES.unavailable),
              });
              return;
            }
            if (!location) return;
            onSample({
              lat: location.latitude,
              lng: location.longitude,
              accuracy: location.accuracy ?? null,
              speed: location.speed ?? null,
              heading: location.bearing ?? null,
              timestamp: typeof location.time === 'number' ? location.time : Date.now(),
              source: this.id,
            });
          },
        );
      } catch (error) {
        onError({
          code: 'unavailable',
          message: error instanceof Error ? error.message : ERROR_MESSAGES.unavailable,
        });
      }
    });
  }

  async stop() {
    const id = this.watcherId;
    this.watcherId = null;
    if (!id) return;
    try {
      await BackgroundGeolocation.removeWatcher({ id });
    } catch {
      // Idempotent cleanup: watcher may already have been removed by the OS.
    }
  }
}

/**
 * Compatibility provider used by the existing driver page.
 * On native Android/iOS it transparently delegates to background GPS.
 * On web/PWA it keeps using navigator.geolocation.
 */
export class BrowserGeolocationProvider implements LocationProvider {
  readonly id = Capacitor.isNativePlatform() ? 'native-background' : 'browser';
  private watchId: number | null = null;
  private nativeProvider: NativeBackgroundLocationProvider | null = null;

  isSupported() {
    if (Capacitor.isNativePlatform()) return true;
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  start(
    onSample: (sample: LocationSample) => void,
    onError: (error: LocationProviderError) => void,
  ) {
    if (Capacitor.isNativePlatform()) {
      this.nativeProvider ??= new NativeBackgroundLocationProvider();
      this.nativeProvider.start(onSample, onError);
      return;
    }

    if (!this.isSupported()) {
      onError({ code: 'unsupported', message: ERROR_MESSAGES.unsupported });
      return;
    }
    void this.stop();
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

  async stop() {
    if (this.nativeProvider) {
      await this.nativeProvider.stop();
    }
    if (this.watchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

export function createLocationProvider(): LocationProvider {
  return Capacitor.isNativePlatform()
    ? new NativeBackgroundLocationProvider()
    : new BrowserGeolocationProvider();
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
