import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

const INSTALLATION_KEY = 'mimaros.installation_id.v1';

function fallbackInstallationId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `mimaros-${Date.now().toString(36)}-${hex || Math.random().toString(36).slice(2)}`;
}

export function getInstallationId(): string {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const existing = storage?.getItem(INSTALLATION_KEY);
  if (existing) return existing;

  const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : fallbackInstallationId();
  try { storage?.setItem(INSTALLATION_KEY, value); } catch { /* storage may be unavailable */ }
  return value;
}

export type ClientPlatform = 'android' | 'ios' | 'web';

export function getClientPlatform(): ClientPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === 'android' || platform === 'ios') return platform;
  return 'web';
}

export interface MobileDeviceRegistrationInput {
  institutionId: string;
  backgroundLocationEnabled?: boolean;
  notificationsEnabled?: boolean;
  pushToken?: string | null;
  motionPermission?: 'unknown' | 'prompt' | 'granted' | 'denied';
}

const registrationCache = new Map<string, Promise<string>>();

/**
 * Registers this installation against the active tenant through the server RPC.
 * The RPC derives the user from auth.uid(), validates active tenant membership,
 * and refuses silently-revoked installations. Calls are de-duplicated per tenant
 * for the lifetime of the current application session.
 */
export function registerMobileDevice(input: MobileDeviceRegistrationInput): Promise<string> {
  const cached = registrationCache.get(input.institutionId);
  if (cached) return cached;

  const request = (async () => {
    const installationId = getInstallationId();
    const { data, error } = await supabase.rpc('register_mobile_device', {
      _institution_id: input.institutionId,
      _installation_id: installationId,
      _platform: getClientPlatform(),
      _device_model: null,
      _os_version: null,
      _app_version: import.meta.env.VITE_APP_VERSION ?? null,
      _push_token: input.pushToken ?? null,
      _notifications_enabled: input.notificationsEnabled ?? false,
      _background_location_enabled: input.backgroundLocationEnabled ?? false,
      _motion_permission: input.motionPermission ?? 'unknown',
    });
    if (error) throw error;
    if (typeof data !== 'string' || !data) throw new Error('Cihaz kaydı kimliği alınamadı.');
    return data;
  })();

  registrationCache.set(input.institutionId, request);
  void request.catch(() => registrationCache.delete(input.institutionId));
  return request;
}

/** Test/session reset helper. Does not delete the persisted installation id. */
export function clearDeviceRegistrationCache() {
  registrationCache.clear();
}
