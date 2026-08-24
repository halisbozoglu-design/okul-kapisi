import { describe, expect, it, vi } from 'vitest';
import { bindLocationPingDevice } from './db';

describe('location ping device binding', () => {
  it('adds the tenant-bound server device id before telemetry insert', async () => {
    const registrar = vi.fn(async ({ institutionId }: { institutionId: string }) => `device-${institutionId}`);

    const result = await bindLocationPingDevice({
      institution_id: 'school-1',
      trip_id: 'trip-1',
      lat: 41.0,
      lng: 29.0,
    }, registrar);

    expect(registrar).toHaveBeenCalledWith({ institutionId: 'school-1' });
    expect(result).toMatchObject({ institution_id: 'school-1', device_id: 'device-school-1' });
  });

  it('preserves an existing device id without re-registering', async () => {
    const registrar = vi.fn(async () => 'unexpected');
    const result = await bindLocationPingDevice({ institution_id: 'school-1', device_id: 'device-existing' }, registrar);

    expect(registrar).not.toHaveBeenCalled();
    expect(result).toMatchObject({ device_id: 'device-existing' });
  });
});
