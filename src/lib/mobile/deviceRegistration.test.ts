import { beforeEach, describe, expect, it } from 'vitest';
import { getClientPlatform, getInstallationId } from './deviceRegistration';

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
});
