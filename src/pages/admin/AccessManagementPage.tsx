import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Copy, Link2, RefreshCw, UserPlus, UserRoundCheck, UserRoundX, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useInstitution } from '@/hooks/useInstitution';
import type { AppRole } from '@/types/auth';

const ASSIGNABLE_ROLES: { value: Exclude<AppRole, 'super_admin'>; label: string }[] = [
  { value: 'kurum_yoneticisi', label: 'Kurum Yöneticisi' },
  { value: 'okul_yoneticisi', label: 'Okul Yöneticisi' },
  { value: 'mudur_yardimcisi', label: 'Müdür Yardımcısı' },
  { value: 'ogretmen', label: 'Öğretmen' },
  { value: 'rehberlik', label: 'Rehberlik' },
  { value: 'koc_ogretmen', label: 'Koç Öğretmen' },
  { value: 'veli', label: 'Veli' },
  { value: 'ogrenci', label: 'Öğrenci' },
  { value: 'personel', label: 'Personel' },
];

interface ProfileRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean;
}

interface MembershipRow {
  id: string;
  user_id: string;
  institution_id: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

interface RoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  expires_at: string | null;
}

interface InvitationRow {
  id: string;
  email: string;
  role: AppRole;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

interface MemberView extends MembershipRow {
  profile: ProfileRow | null;
  roles: RoleRow[];
}

const roleLabel = (role: AppRole) =>
  ASSIGNABLE_ROLES.find((x) => x.value === role)?.label ?? role;

export default function AccessManagementPage() {
  const { institutionId, loading: institutionLoading } = useInstitution();
  const [members, setMembers] = useState<MemberView[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<AppRole, 'super_admin'>>('ogretmen');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!institutionId) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ data: membershipData, error: membershipError }, { data: roleData }, { data: inviteData }] = await Promise.all([
      db.from('user_institutions')
        .select('id,user_id,institution_id,is_active,is_default,created_at')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: true }),
      db.from('user_institution_roles')
        .select('id,user_id,role,is_active,expires_at')
        .eq('institution_id', institutionId),
      db.from('institution_invitations')
        .select('id,email,role,expires_at,accepted_at,cancelled_at,created_at')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false }),
    ]);

    if (membershipError) {
      toast.error(`Üyelikler alınamadı: ${membershipError.message}`);
      setLoading(false);
      return;
    }

    const memberships = (membershipData ?? []) as MembershipRow[];
    const userIds = memberships.map((x) => x.user_id);
    let profiles: ProfileRow[] = [];
    if (userIds.length) {
      const { data: profileData, error: profileError } = await db.from('profiles')
        .select('user_id,first_name,last_name,phone,is_active')
        .in('user_id', userIds);
      if (profileError) toast.error(`Profiller alınamadı: ${profileError.message}`);
      profiles = (profileData ?? []) as ProfileRow[];
    }

    const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));
    const roles = (roleData ?? []) as RoleRow[];
    setMembers(memberships.map((membership) => ({
      ...membership,
      profile: profileByUser.get(membership.user_id) ?? null,
      roles: roles.filter((r) => r.user_id === membership.user_id),
    })));
    setInvitations((inviteData ?? []) as InvitationRow[]);
    setLoading(false);
  }, [institutionId]);

  useEffect(() => { void load(); }, [load]);

  const activeInvitations = useMemo(
    () => invitations.filter((x) => !x.accepted_at && !x.cancelled_at && new Date(x.expires_at).getTime() > Date.now()),
    [invitations],
  );

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!institutionId || !email.trim()) return;
    setBusy(true);
    setInviteUrl(null);
    const { data, error } = await db.rpc('create_institution_invite', {
      _institution_id: institutionId,
      _email: email.trim(),
      _role: role,
      _expires_hours: 72,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message === 'ACTIVE_INVITE_EXISTS'
        ? 'Bu kullanıcı için aynı rolde aktif bir davet zaten var.'
        : `Davet oluşturulamadı: ${error.message}`);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const token = row?.invite_token as string | undefined;
    if (!token) {
      toast.error('Davet oluşturuldu ancak tek kullanımlık bağlantı alınamadı.');
      await load();
      return;
    }

    const url = `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}`;
    setInviteUrl(url);
    setEmail('');
    toast.success('Davet oluşturuldu. Bağlantı güvenlik nedeniyle yalnız bu ekranda bir kez gösterilir.');
    await load();
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success('Davet bağlantısı kopyalandı.');
  };

  const cancelInvite = async (id: string) => {
    setBusy(true);
    const { error } = await db.rpc('cancel_institution_invite', { _invitation_id: id });
    setBusy(false);
    if (error) {
      toast.error(`Davet iptal edilemedi: ${error.message}`);
      return;
    }
    toast.success('Davet iptal edildi.');
    await load();
  };

  const toggleMembership = async (member: MemberView) => {
    setBusy(true);
    const next = !member.is_active;
    const { error } = await db.from('user_institutions')
      .update({ is_active: next, is_default: next ? member.is_default : false, updated_at: new Date().toISOString() })
      .eq('id', member.id)
      .eq('institution_id', member.institution_id);
    setBusy(false);
    if (error) {
      toast.error(`Üyelik güncellenemedi: ${error.message}`);
      return;
    }
    toast.success(next ? 'Kurum üyeliği etkinleştirildi.' : 'Kurum üyeliği pasifleştirildi.');
    await load();
  };

  if (institutionLoading) {
    return <div className="flex min-h-screen items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Kullanıcı & Yetki Yönetimi"
        description="Kurum üyeliklerini, tenant rollerini ve güvenli davetleri yönetin."
        actions={<Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Yenile</Button>}
      />

      {!institutionId && (
        <Alert>
          <AlertTitle>Aktif kurum bulunamadı</AlertTitle>
          <AlertDescription>Yetki yönetimi için önce aktif bir kurum bağlamı seçilmelidir.</AlertDescription>
        </Alert>
      )}

      {institutionId && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader>
              <CardTitle>Kurum Üyeleri</CardTitle>
              <CardDescription>Pasif üyelikler veri erişimi vermez; gerçek erişim RLS tarafından uygulanır.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10"><RefreshCw className="h-6 w-6 animate-spin" /></div>
              ) : members.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Bu kurumda kayıtlı kullanıcı yok.</p>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => {
                    const name = [member.profile?.first_name, member.profile?.last_name].filter(Boolean).join(' ') || 'İsimsiz kullanıcı';
                    return (
                      <div key={member.id} className="rounded-lg border p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{name}</p>
                              <Badge variant={member.is_active ? 'default' : 'secondary'}>{member.is_active ? 'Aktif' : 'Pasif'}</Badge>
                              {member.is_default && <Badge variant="outline">Varsayılan kurum</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{member.user_id}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {member.roles.length ? member.roles.map((r) => (
                                <Badge key={r.id} variant={r.is_active ? 'outline' : 'secondary'}>
                                  {roleLabel(r.role)}{!r.is_active ? ' · pasif' : ''}{r.expires_at ? ' · süreli' : ''}
                                </Badge>
                              )) : <span className="text-xs text-muted-foreground">Tenant rolü yok</span>}
                            </div>
                          </div>
                          <Button variant={member.is_active ? 'destructive' : 'outline'} size="sm" onClick={() => void toggleMembership(member)} disabled={busy}>
                            {member.is_active ? <UserRoundX className="mr-2 h-4 w-4" /> : <UserRoundCheck className="mr-2 h-4 w-4" />}
                            {member.is_active ? 'Pasifleştir' : 'Etkinleştir'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Yeni Kullanıcı Daveti</CardTitle>
                <CardDescription>72 saat geçerli, tek kullanımlık ve sunucuda hash olarak saklanan davet oluşturur.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={createInvite}>
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">E-posta</Label>
                    <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="kullanici@ornek.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Rol</Label>
                    <Select value={role} onValueChange={(value) => setRole(value as Exclude<AppRole, 'super_admin'>)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" type="submit" disabled={busy}><UserPlus className="mr-2 h-4 w-4" />Davet Oluştur</Button>
                </form>

                {inviteUrl && (
                  <Alert className="mt-4">
                    <Link2 className="h-4 w-4" />
                    <AlertTitle>Tek kullanımlık davet bağlantısı</AlertTitle>
                    <AlertDescription>
                      <p className="mb-2 break-all text-xs">{inviteUrl}</p>
                      <Button size="sm" variant="outline" onClick={() => void copyInvite()}><Copy className="mr-2 h-4 w-4" />Kopyala</Button>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Aktif Davetler</CardTitle>
                <CardDescription>{activeInvitations.length} bekleyen davet</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeInvitations.length === 0 ? <p className="text-sm text-muted-foreground">Aktif davet yok.</p> : activeInvitations.map((invite) => (
                  <div key={invite.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">{roleLabel(invite.role)} · {new Date(invite.expires_at).toLocaleString('tr-TR')}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => void cancelInvite(invite.id)} disabled={busy} aria-label="Daveti iptal et"><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
