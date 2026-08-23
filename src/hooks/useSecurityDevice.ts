import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { useInstitution } from '@/hooks/useInstitution';

export interface SecurityLocation {
  id: string;
  name: string;
  code: string | null;
  kind: 'entrance' | 'exit' | 'both' | 'duty_area';
  visitor_entry_enabled: boolean;
  student_duty_enabled: boolean;
  gender_rule: 'any' | 'male' | 'female';
  capacity: number | null;
  is_active: boolean;
  campus_id: string | null;
}

const STORAGE_KEY = 'mimaros.security.deviceLocationId';

/** Cihaza bağlı giriş noktası seçimi (localStorage'da hatırlanır). */
export function useSecurityDevice() {
  const { institutionId, loading: instLoading } = useInstitution();
  const [locations, setLocations] = useState<SecurityLocation[]>([]);
  const [locationId, setLocationIdState] = useState<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (instLoading) return;
    if (!institutionId) {
      setLoading(false);
      return;
    }
    const { data } = await db
      .from('security_locations')
      .select('id, name, code, kind, visitor_entry_enabled, student_duty_enabled, gender_rule, capacity, is_active, campus_id')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name');
    setLocations((data as SecurityLocation[]) ?? []);
    setLoading(false);
  }, [institutionId, instLoading]);

  useEffect(() => { load(); }, [load]);

  const setLocationId = useCallback((id: string | null) => {
    setLocationIdState(id);
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const entryLocations = locations.filter(
    (l) => l.visitor_entry_enabled && (l.kind === 'entrance' || l.kind === 'both' || l.kind === 'exit'),
  );
  const dutyLocations = locations.filter((l) => l.student_duty_enabled);
  const selected = locations.find((l) => l.id === locationId) ?? null;

  return { institutionId, locations, entryLocations, dutyLocations, locationId, selected, setLocationId, loading: loading || instLoading, reload: load };
}
