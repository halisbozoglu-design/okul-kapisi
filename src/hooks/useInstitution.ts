import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'mimaros.activeInstitutionId';

/**
 * Resolves the tenant the current user is actively working in.
 * - inactive memberships are never selected
 * - an explicitly selected active tenant wins
 * - otherwise the default membership wins
 * - super admins can fall back to the first active institution
 */
export function useInstitution() {
  const { user, hasRole } = useAuth();
  const [institutionId, setInstitutionIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setInstitutionId = useCallback((id: string | null) => {
    setInstitutionIdState(id);
    if (typeof window === 'undefined') return;
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        if (!cancelled) {
          setInstitutionIdState(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const preferred = typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(STORAGE_KEY);

      const { data: links } = await db
        .from('user_institutions')
        .select('institution_id, is_default, created_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      const memberships = links ?? [];
      let id = preferred && memberships.some((x) => x.institution_id === preferred)
        ? preferred
        : memberships[0]?.institution_id ?? null;

      if (!id && hasRole('super_admin')) {
        const { data: inst } = await db
          .from('institutions')
          .select('id')
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(1);
        id = inst?.[0]?.id ?? null;
      }

      if (!cancelled) {
        setInstitutionId(id);
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [user?.id, hasRole, setInstitutionId]);

  return { institutionId, setInstitutionId, loading };
}
