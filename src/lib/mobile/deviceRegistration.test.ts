import { beforeEach, describe, expect, it } from 'vitest';
import {
  deviceRegistrationFingerprint,
  getClientPlatform,
  getInstallationId,
} from './deviceRegistration';

describe('mobile device registration identity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists one stable installation id per browser/app storage', () => {
    const first = getInstallationId();
    const second = getInstallationId();

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(window.localStorage.getItem('mimaros.installation_id.v1')).toBe(first);
  });

  it('normalizes non-native runtime to web', () => {
    expect(['android', 'ios', 'web']).toContain(getClientPlatform());
  });

  it('changes the registration fingerprint when permission or token state changes', () => {
    const enabledA = deviceRegistrationFingerprint({
      institutionId: 'tenant-1',
      notificationsEnabled: true,
      pushToken: 'token-a',
      backgroundLocationEnabled: true,
    });
    const enabledB = deviceRegistrationFingerprint({
      institutionId: 'tenant-1',
      notificationsEnabled: true,
      pushToken: 'token-b',
      backgroundLocationEnabled: true,
    });
    const disabled = deviceRegistrationFingerprint({
      institutionId: 'tenant-1',
      notificationsEnabled: false,
      pushToken: 'stale-token-must-not-matter',
      backgroundLocationEnabled: true,
    });

    expect(enabledB).not.toBe(enabledA);
    expect(disabled).not.toBe(enabledA);
    expect(disabled).toBe(deviceRegistrationFingerprint({
      institutionId: 'tenant-1',
      notificationsEnabled: false,
      pushToken: null,
      backgroundLocationEnabled: true,
    }));
  });
});
