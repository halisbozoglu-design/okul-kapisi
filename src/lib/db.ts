import { supabase } from '@/integrations/supabase/client';
import { registerMobileDevice } from '@/lib/mobile/deviceRegistration';

/**
 * Untyped access helper.
 * Generated Supabase types lag behind new migrations; transport module tables
 * are accessed through this helper until types.ts is regenerated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawDb = supabase as any;

/**
 * Location telemetry must be attributable to the authenticated installation.
 * The database still validates tenant/user/device ownership through RLS; this
 * wrapper only guarantees that inserts carry the server-issued device id.
 */
function locationPingsBuilder() {
  const builder = rawDb.from('location_pings');
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop !== 'insert') return Reflect.get(target, prop, receiver);
      return async (values: unknown, options?: unknown) => {
        const rows = Array.isArray(values) ? values : [values];
        const boundRows = await Promise.all(rows.map(async row => {
          if (!row || typeof row !== 'object') return row;
          const value = row as Record<string, unknown>;
          if (value.device_id || typeof value.institution_id !== 'string') return value;
          const deviceId = await registerMobileDevice({ institutionId: value.institution_id });
          return { ...value, device_id: deviceId };
        }));
        return target.insert(Array.isArray(values) ? boundRows : boundRows[0], options);
      };
    },
  });
}

export const db = new Proxy(rawDb, {
  get(target, prop, receiver) {
    if (prop === 'from') {
      return (relation: string) => relation === 'location_pings'
        ? locationPingsBuilder()
        : target.from(relation);
    }
    return Reflect.get(target, prop, receiver);
  },
});
