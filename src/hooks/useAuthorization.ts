import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useInstitution } from '@/hooks/useInstitution';
import type { AppRole } from '@/types/auth';

export interface PermissionGrant {
  resource: string;
  action: string;
}

interface AccessContext {
  institution_id: string | null;
  is_super_admin: boolean;
  roles: AppRole[];
  permissions: PermissionGrant[];
}

const EMPTY: AccessContext = {
  institution_id: null,
  is_super_admin: false,
  roles: [],
  permissions: [],
};

/** Tenant-scoped authorization context returned by the database.
 * Frontend checks improve UX only; RLS/RPC remains authoritative.
 */
export function useAuthorization() {
  const { user, roles: legacyRoles } = useAuth();
  const { institutionId, loading: institutionLoading } = useInstitution();
  const [context, setContext] = useState<AccessContext>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || institutionLoading) return;
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await db.rpc('get_my_access_context', {
      _institution_id: institutionId,
    });

    if (rpcError) {
      // Backwards-compatible fallback until the authorization migration is deployed.
      setContext({
        institution_id: institutionId,
        is_super_admin: legacyRoles.includes('super_admin'),
        roles: legacyRoles,
        permissions: [],
      });
      setError(rpcError.message ?? 'Yetki bağlamı alınamadı');
    } else {
      const value = (data ?? EMPTY) as AccessContext;
      setContext({
        institution_id: value.institution_id ?? institutionId,
        is_super_admin: Boolean(value.is_super_admin),
        roles: Array.isArray(value.roles) ? value.roles : [],
        permissions: Array.isArray(value.permissions) ? value.permissions : [],
      });
    }
    setLoading(false);
  }, [user, institutionId, institutionLoading, legacyRoles]);

  useEffect(() => {
    if (!user) {
      setContext(EMPTY);
      setLoading(false);
      return;
    }
    void refresh();
  }, [user, refresh]);

  const permissionSet = useMemo(
    () => new Set(context.permissions.map((p) => `${p.resource}:${p.action}`)),
    [context.permissions],
  );

  const hasPermission = useCallback(
    (resource: string, action: string) =>
      context.is_super_admin || permissionSet.has(`${resource}:${action}`),
    [context.is_super_admin, permissionSet],
  );

  const hasTenantRole = useCallback(
    (role: AppRole) => context.is_super_admin || context.roles.includes(role),
    [context],
  );

  return {
    institutionId: context.institution_id ?? institutionId,
    roles: context.roles,
    permissions: context.permissions,
    isSuperAdmin: context.is_super_admin,
    loading: loading || institutionLoading,
    error,
    hasPermission,
    hasTenantRole,
    refresh,
  };
}
