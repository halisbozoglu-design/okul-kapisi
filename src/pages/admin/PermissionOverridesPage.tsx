import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ShieldCheck, ShieldOff, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useInstitution } from '@/hooks/useInstitution';
import type { AppRole } from '@/types/auth';

interface MembershipRow {
  id: string;
  user_id: string;
  institution_id: string;
  is_active: boolean;
}

interface ProfileRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
}

interface RoleRow {
  user_id: string;
  role: AppRole;
  is_active: boolean;
  expires_at: string | null;
}

interface PermissionRow {
  role: AppRole;
  resource: string;
  action: string;
}

interface OverrideRow {
  id: string;
  user_id: string;
  institution_id: string;
  resource: string;
  action: string;
  allowed: boolean;
  reason: string | null;
  granted_by: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberView extends MembershipRow {
  profile: ProfileRow | null;
  roles: RoleRow[];
}

interface PermissionOption {
  resource: string;
  action: string;
  key: string;
  roles: AppRole[];
}

const permissionLabel = (resource: string, action: string) => `${resource}.${action}`;

const errorMessage = (message: string) => {
  if (message.includes('NOT_AUTHORIZED_FOR_MEMBER')) return 'Bu kullanıcı üzerinde yetki değişikliği yapamazsınız.';
  if (message.includes('UNKNOWN_PERMISSION')) return 'Bu yetki sistem kataloğunda tanımlı değil.';
  if (message.includes('CANNOT_DELEGATE_PERMISSION')) return 'Sahip olmadığınız bir yetkiyi kullanıcıya veremezsiniz.';
  if (message.includes('PERMISSION_EXPIRY_MUST_BE_FUTURE')) return 'Yetki bitiş tarihi gelecekte olmalıdır.';
  if (message.includes('AUTH_REQUIRED')) return 'Oturum doğrulanamadı.';
  return message;
};

export default function PermissionOverridesPage() {
  const { institutionId, loading: institutionLoading } = useInstitution();
  const [members, setMembers] = useState<MemberView[]>([]);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPermissionKey, setSelectedPermissionKey] = useState('');
  const [mode, setMode] = useState<'allow' | 'deny'>('allow');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!institutionId) {
      setMembers([]);
      setPermissions([]);
      setOverrides([]);
      setSelectedUserId('');
      setLoading(false);
      return;
    }

    setLoading(true);
    const [membershipResult, roleResult, permissionResult, overrideResult] = await Promise.all([
      db.from('user_institutions')
        .select('id,user_id,institution_id,is_active')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      db.from('user_institution_roles')
        .select('user_id,role,is_active,expires_at')
        .eq('institution_id', institutionId),
      db.from('permissions')
        .select('role,resource,action')
        .order('resource', { ascending: true })
        .order('action', { ascending: true }),
      db.from('user_permission_overrides')
        .select('id,user_id,institution_id,resource,action,allowed,reason,granted_by,expires_at,created_at,updated_at')
        .eq('institution_id', institutionId)
        .order('updated_at', { ascending: false }),
    ]);

    if (membershipResult.error) {
      toast.error(`Kurum üyeleri alınamadı: ${membershipResult.error.message}`);
      setLoading(false);
      return;
    }
    if (roleResult.error) toast.error(`Roller alınamadı: ${roleResult.error.message}`);
    if (permissionResult.error) toast.error(`Yetki kataloğu alınamadı: ${permissionResult.error.message}`);
    if (overrideResult.error) toast.error(`Özel yetkiler alınamadı: ${overrideResult.error.message}`);

    const memberships = (membershipResult.data ?? []) as MembershipRow[];
    const userIds = memberships.map((row) => row.user_id);
    let profiles: ProfileRow[] = [];
    if (userIds.length) {
      const profileResult = await db.from('profiles')
        .select('user_id,first_name,last_name,is_active')
        .in('user_id', userIds);
      if (profileResult.error) toast.error(`Profiller alınamadı: ${profileResult.error.message}`);
      profiles = (profileResult.data ?? []) as ProfileRow[];
    }

    const profileByUser = new Map(profiles.map((row) => [row.user_id, row]));
    const roleRows = (roleResult.data ?? []) as RoleRow[];
    const now = Date.now();
    const memberRows: MemberView[] = memberships.map((membership) => ({
      ...membership,
      profile: profileByUser.get(membership.user_id) ?? null,
      roles: roleRows.filter((role) =>
        role.user_id === membership.user_id
        && role.is_active
        && (!role.expires_at || new Date(role.expires_at).getTime() > now),
      ),
    }));
    setMembers(memberRows);

    const permissionRows = (permissionResult.data ?? []) as PermissionRow[];
    const optionMap = new Map<string, PermissionOption>();
    for (const row of permissionRows) {
      const key = `${row.resource}:${row.action}`;
      const current = optionMap.get(key) ?? { resource: row.resource, action: row.action, key, roles: [] };
      if (!current.roles.includes(row.role)) current.roles.push(row.role);
      optionMap.set(key, current);
    }
    const options = [...optionMap.values()].sort((a, b) => a.key.localeCompare(b.key, 'tr'));
    setPermissions(options);
    setOverrides((overrideResult.data ?? []) as OverrideRow[]);

    setSelectedUserId((current) => current && memberRows.some((member) => member.user_id === current)
      ? current
      : (memberRows[0]?.user_id ?? ''));
    setSelectedPermissionKey((current) => current && optionMap.has(current)
      ? current
      : (options[0]?.key ?? ''));
    setLoading(false);
  }, [institutionId]);

  useEffect(() => { void load(); }, [load]);

  const selectedMember = useMemo(
    () => members.find((member) => member.user_id === selectedUserId) ?? null,
    [members, selectedUserId],
  );

  const selectedPermission = useMemo(
    () => permissions.find((permission) => permission.key === selectedPermissionKey) ?? null,
    [permissions, selectedPermissionKey],
  );

  const selectedUserOverrides = useMemo(
    () => overrides.filter((row) => row.user_id === selectedUserId),
    [overrides, selectedUserId],
  );

  const selectedExistingOverride = useMemo(() => {
    if (!selectedPermission) return null;
    return selectedUserOverrides.find((row) =>
      row.resource === selectedPermission.resource && row.action === selectedPermission.action,
    ) ?? null;
  }, [selectedPermission, selectedUserOverrides]);

  const roleGranted = useMemo(() => {
    if (!selectedMember || !selectedPermission) return false;
    const activeRoles = new Set(selectedMember.roles.map((row) => row.role));
    return selectedPermission.roles.some((role) => activeRoles.has(role));
  }, [selectedMember, selectedPermission]);

  useEffect(() => {
    if (!selectedExistingOverride) {
      setMode('allow');
      setReason('');
      setExpiresAt('');
      return;
    }
    setMode(selectedExistingOverride.allowed ? 'allow' : 'deny');
    setReason(selectedExistingOverride.reason ?? '');
    setExpiresAt(selectedExistingOverride.expires_at
      ? new Date(new Date(selectedExistingOverride.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : '');
  }, [selectedExistingOverride?.id, selectedExistingOverride?.updated_at]);

  const saveOverride = async () => {
    if (!institutionId || !selectedMember || !selectedPermission) return;
    setBusy(true);
    const { error } = await db.rpc('set_user_permission_override', {
      _institution_id: institutionId,
      _target_user_id: selectedMember.user_id,
      _resource: selectedPermission.resource,
      _action: selectedPermission.action,
      _allowed: mode === 'allow',
      _reason: reason.trim() || null,
      _expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setBusy(false);
    if (error) {
      toast.error(`Özel yetki kaydedilemedi: ${errorMessage(error.message)}`);
      return;
    }
    toast.success(mode === 'allow' ? 'Özel izin kaydedildi.' : 'Özel engel kaydedildi.');
    await load();
  };

  const clearOverride = async (row: OverrideRow) => {
    if (!institutionId) return;
    setBusy(true);
    const { error } = await db.rpc('clear_user_permission_override', {
      _institution_id: institutionId,
      _target_user_id: row.user_id,
      _resource: row.resource,
      _action: row.action,
    });
    setBusy(false);
    if (error) {
      toast.error(`Özel yetki kaldırılamadı: ${errorMessage(error.message)}`);
      return;
    }
    toast.success('Özel yetki kaldırıldı; rol matrisi yeniden geçerli.');
    await load();
  };

  if (institutionLoading) {
    return <div className="flex min-h-screen items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Kullanıcı Özel Yetkileri"
        description="Rol matrisini bozmadan kullanıcı bazlı izin veya engel tanımlayın. Tüm yazma işlemleri güvenli RPC üzerinden yapılır."
        actions={<Button variant="outline" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="mr-2 h-4 w-4" />Yenile</Button>}
      />

      {!institutionId ? (
        <Alert>
          <AlertTitle>Aktif kurum bulunamadı</AlertTitle>
          <AlertDescription>Özel yetki yönetimi için aktif bir kurum bağlamı gerekir.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <CardHeader>
              <CardTitle>Yetki Düzenle</CardTitle>
              <CardDescription>Özel engel rolün verdiği yetkinin önüne geçer. Özel izin ise yalnız yöneticinin kendisinin sahip olduğu katalog yetkilerinden verilebilir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {loading ? (
                <div className="flex justify-center py-10"><RefreshCw className="h-6 w-6 animate-spin" /></div>
              ) : members.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Aktif kurum üyesi bulunmuyor.</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Kullanıcı</Label>
                      <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={busy}>
                        <SelectTrigger><SelectValue placeholder="Kullanıcı seçin" /></SelectTrigger>
                        <SelectContent>
                          {members.map((member) => {
                            const name = [member.profile?.first_name, member.profile?.last_name].filter(Boolean).join(' ') || member.user_id;
                            return <SelectItem key={member.user_id} value={member.user_id}>{name}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Yetki</Label>
                      <Select value={selectedPermissionKey} onValueChange={setSelectedPermissionKey} disabled={busy || permissions.length === 0}>
                        <SelectTrigger><SelectValue placeholder="Yetki seçin" /></SelectTrigger>
                        <SelectContent>
                          {permissions.map((permission) => (
                            <SelectItem key={permission.key} value={permission.key}>{permissionLabel(permission.resource, permission.action)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedMember && selectedPermission && (
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Rol kaynağı: {roleGranted ? 'veriyor' : 'vermiyor'}</Badge>
                        {selectedExistingOverride && (
                          <Badge variant={selectedExistingOverride.allowed ? 'default' : 'destructive'}>
                            {selectedExistingOverride.allowed ? 'Özel izin aktif' : 'Özel engel aktif'}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Aktif roller: {selectedMember.roles.length ? selectedMember.roles.map((row) => row.role).join(', ') : 'yok'}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Özel kural</Label>
                    <Select value={mode} onValueChange={(value) => setMode(value as 'allow' | 'deny')} disabled={busy}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allow">Özel izin ver</SelectItem>
                        <SelectItem value="deny">Özel engel koy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="permission-reason">Gerekçe</Label>
                    <Textarea id="permission-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Örn. geçici görev, vekalet, hassas modül kısıtı" disabled={busy} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="permission-expiry">Bitiş tarihi</Label>
                    <Input id="permission-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={busy} />
                    <p className="text-xs text-muted-foreground">Boş bırakılırsa özel kural süresizdir.</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void saveOverride()} disabled={busy || !selectedMember || !selectedPermission}>
                      {mode === 'allow' ? <ShieldCheck className="mr-2 h-4 w-4" /> : <ShieldOff className="mr-2 h-4 w-4" />}
                      <Save className="mr-2 h-4 w-4" />Kaydet
                    </Button>
                    {selectedExistingOverride && (
                      <Button variant="outline" onClick={() => void clearOverride(selectedExistingOverride)} disabled={busy}>
                        <RotateCcw className="mr-2 h-4 w-4" />Özel Kuralı Kaldır
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aktif Özel Kurallar</CardTitle>
              <CardDescription>Seçili kullanıcıya ait allow/deny override kayıtları.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedUserOverrides.length === 0 ? (
                <p className="text-sm text-muted-foreground">Bu kullanıcı için özel yetki yok; rol matrisi doğrudan uygulanıyor.</p>
              ) : selectedUserOverrides.map((row) => {
                const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;
                return (
                  <div key={row.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{permissionLabel(row.resource, row.action)}</p>
                          <Badge variant={row.allowed ? 'default' : 'destructive'}>{row.allowed ? 'İzin' : 'Engel'}</Badge>
                          {expired && <Badge variant="secondary">Süresi dolmuş</Badge>}
                        </div>
                        {row.reason && <p className="mt-1 text-sm text-muted-foreground">{row.reason}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.expires_at ? `Bitiş: ${new Date(row.expires_at).toLocaleString('tr-TR')}` : 'Süresiz'}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => void clearOverride(row)} disabled={busy} aria-label="Özel kuralı kaldır">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}
