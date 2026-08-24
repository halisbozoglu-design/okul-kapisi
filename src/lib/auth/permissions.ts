import type { AppRole } from '@/types/auth';

export const PERMISSIONS = {
  ACCESS_MANAGE: { resource: 'users', action: 'manage' },
  SETTINGS_MANAGE: { resource: 'settings', action: 'manage' },
  TRANSPORT_VIEW: { resource: 'transport', action: 'view' },
  TRANSPORT_MANAGE: { resource: 'transport', action: 'manage' },
  TRANSPORT_LIVE_TRACK: { resource: 'transport', action: 'live_track' },
  TRANSPORT_PARENT_VIEW: { resource: 'transport.parent', action: 'view' },
  AUDIT_VIEW: { resource: 'audit', action: 'view' },
} as const;

export type PermissionKey = `${string}:${string}`;

/**
 * Temporary compatibility matrix used only when get_my_access_context is not
 * available yet. DB RLS/RPC is still authoritative for data access.
 */
export const LEGACY_ROLE_PERMISSIONS: Partial<Record<AppRole, readonly PermissionKey[]>> = {
  super_admin: ['users:manage', 'settings:manage', 'transport:view', 'transport:manage', 'transport:live_track', 'transport.parent:view', 'audit:view'],
  kurum_yoneticisi: ['users:manage', 'settings:manage', 'transport:view', 'transport:manage', 'transport:live_track', 'audit:view'],
  okul_yoneticisi: ['users:manage', 'settings:manage', 'transport:view', 'transport:manage', 'transport:live_track', 'audit:view'],
  mudur_yardimcisi: ['transport:view', 'transport:manage', 'transport:live_track'],
  veli: ['transport.parent:view'],
};

export function legacyPermissionSet(roles: AppRole[]): Set<PermissionKey> {
  const result = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of LEGACY_ROLE_PERMISSIONS[role] ?? []) result.add(permission);
  }
  return result;
}
