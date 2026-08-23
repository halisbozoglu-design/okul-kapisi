import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

/**
 * Resolves the institution the current user works in.
 * Super admins fall back to the first available institution.
 */
export function useInstitution() {
  const { user, hasRole } = useAuth();
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: links } = await db
        .from('user_institutions')
        .select('institution_id')
        .eq('user_id', user.id)
        .limit(1);
      let id: string | null = links?.[0]?.institution_id ?? null;
      if (!id && hasRole('super_admin')) {
        const { data: inst } = await db
          .from('institutions')
          .select('id')
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
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { institutionId, loading };
}
