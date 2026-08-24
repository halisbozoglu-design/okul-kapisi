import type { AppRole } from '@/types/auth';

export const PERMISSIONS = {
  ACCESS_MANAGE: { resource: 'users', action: 'manage' },
  SETTINGS_MANAGE: { resource: 'settings', action: 'manage' },
  TRANSPORT_VIEW: { resource: 'transport', action: 'view' },
  TRANSPORT_MANAGE: { resource: 'transport', action: 'manage' },
  TRANSPORT_LIVE_TRACK: { resource: 'transport', action: 'live_track' },
  TRANSPORT_DRIVER_OPERATE: { resource: 'transport.driver', action: 'operate' },
  TRANSPORT_PARENT_VIEW: { resource: 'transport.parent', action: 'view' },
  TRANSPORT_VEHICLE_MANAGE: { resource: 'transport.vehicle', action: 'manage' },
  TRANSPORT_STAFF_MANAGE: { resource: 'transport.staff', action: 'manage' },
  TRANSPORT_ROUTE_MANAGE: { resource: 'transport.route', action: 'manage' },
  TRANSPORT_ASSIGNMENT_MANAGE: { resource: 'transport.assignment', action: 'manage' },
  TRANSPORT_TRIP_MANAGE: { resource: 'transport.trip', action: 'manage' },
  TRANSPORT_SETTINGS_MANAGE: { resource: 'transport.settings', action: 'manage' },
  TRANSPORT_ABSENCE_MANAGE: { resource: 'transport.absence', action: 'manage' },
  SECURITY_OPERATE: { resource: 'security', action: 'operate' },
  SECURITY_MANAGE: { resource: 'security', action: 'manage' },
  SECURITY_STUDENT_DUTY_VIEW: { resource: 'security.student_duty', action: 'view' },
  AUDIT_VIEW: { resource: 'audit', action: 'view' },
} as const;

export type PermissionKey = `${string}:${string}`;

const TRANSPORT_MANAGER_PERMISSION_KEYS: readonly PermissionKey[] = [
  'transport:view', 'transport:manage', 'transport:live_track', 'transport.driver:operate',
  'transport.vehicle:manage', 'transport.staff:manage', 'transport.route:manage',
  'transport.assignment:manage', 'transport.trip:manage', 'transport.settings:manage',
  'transport.absence:manage',
];

/**
 * Temporary compatibility matrix used only when get_my_access_context is not
 * available yet. DB RLS/RPC is still authoritative for data access.
 */
export const LEGACY_ROLE_PERMISSIONS: Partial<Record<AppRole, readonly PermissionKey[]>> = {
  super_admin: [
    'users:manage', 'settings:manage',
    ...TRANSPORT_MANAGER_PERMISSION_KEYS, 'transport.parent:view',
    'security:operate', 'security:manage', 'security.student_duty:view',
    'audit:view',
  ],
  kurum_yoneticisi: [
    'users:manage', 'settings:manage',
    ...TRANSPORT_MANAGER_PERMISSION_KEYS,
    'security:operate', 'security:manage', 'security.student_duty:view',
    'audit:view',
  ],
  okul_yoneticisi: [
    'users:manage', 'settings:manage',
    ...TRANSPORT_MANAGER_PERMISSION_KEYS,
    'security:operate', 'security:manage', 'security.student_duty:view',
    'audit:view',
  ],
  mudur_yardimcisi: [
    ...TRANSPORT_MANAGER_PERMISSION_KEYS,
    'security:operate', 'security:manage', 'security.student_duty:view',
  ],
  ogretmen: ['security.student_duty:view'],
  personel: ['security:operate', 'transport.driver:operate'],
  veli: ['transport.parent:view'],
};

export function legacyPermissionSet(roles: AppRole[]): Set<PermissionKey> {
  const result = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of LEGACY_ROLE_PERMISSIONS[role] ?? []) result.add(permission);
  }
  return result;
}
