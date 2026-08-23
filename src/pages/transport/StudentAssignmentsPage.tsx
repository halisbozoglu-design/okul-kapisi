import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { FormModal } from '@/components/common/FormModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Users, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useTransportCrud } from '@/hooks/useTransportCrud';
import { useInstitution } from '@/hooks/useInstitution';
import {
  Route as RouteType, RouteStop, Student, StudentAssignment,
  DIRECTION_LABELS, TransportDirection,
} from '@/types/transport';

const NONE = '__none__';

interface AssignmentRow extends StudentAssignment {
  students?: Student | null;
}

interface GuardianProfile { user_id: string; first_name: string | null; last_name: string | null }
interface GuardianLink { id: string; user_id: string; relation: string | null }

export default function StudentAssignmentsPage() {
  const { institutionId } = useInstitution();
  const students = useTransportCrud<Student>('students', { orderBy: 'first_name', ascending: true });
  const routes = useTransportCrud<RouteType>('routes', { orderBy: 'name', ascending: true });

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [routeFilter, setRouteFilter] = useState<string>('');
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [search, setSearch] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignForm, setAssignForm] = useState({ route_id: '', stop_id: NONE, direction: 'both' as TransportDirection });
  const [studentForm, setStudentForm] = useState({ first_name: '', last_name: '', student_no: '', guardian_name: '', guardian_phone: '' });

  const [guardianFor, setGuardianFor] = useState<AssignmentRow | null>(null);
  const [profiles, setProfiles] = useState<GuardianProfile[]>([]);
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [guardianForm, setGuardianForm] = useState({ user_id: '', relation: '' });

  const openGuardian = async (a: AssignmentRow) => {
    setGuardianFor(a);
    setGuardianForm({ user_id: '', relation: '' });
    const [{ data: pr }, { data: lk }] = await Promise.all([
      db.from('profiles').select('user_id, first_name, last_name').eq('is_active', true).is('deleted_at', null).order('first_name'),
      db.from('student_guardians').select('id, user_id, relation').eq('student_id', a.student_id).is('deleted_at', null),
    ]);
    setProfiles((pr || []) as GuardianProfile[]);
    setLinks((lk || []) as GuardianLink[]);
  };

  const submitGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardianFor || !guardianForm.user_id) return;
    if (!institutionId) { toast.error('Kurum bilgisi bulunamadı'); return; }
    const { error } = await db.from('student_guardians').insert({
      institution_id: institutionId,
      student_id: guardianFor.student_id,
      user_id: guardianForm.user_id,
      relation: guardianForm.relation || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Veli bağlandı');
    openGuardian(guardianFor);
  };

  const removeGuardian = async (id: string) => {
    const { error } = await db.from('student_guardians')
      .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  const loadAssignments = async () => {
    let q = db.from('student_transport_assignments')
      .select('*, students(*)').is('deleted_at', null).order('created_at', { ascending: false });
    if (routeFilter) q = q.eq('route_id', routeFilter);
    const { data } = await q;
    setAssignments((data || []) as AssignmentRow[]);
  };

  useEffect(() => { loadAssignments(); /* eslint-disable-next-line */ }, [routeFilter]);

  useEffect(() => {
    const load = async () => {
      if (!assignForm.route_id) { setStops([]); return; }
      const { data } = await db.from('route_stops').select('*').eq('route_id', assignForm.route_id)
        .is('deleted_at', null).order('order_index', { ascending: true });
      setStops((data || []) as RouteStop[]);
    };
    load();
  }, [assignForm.route_id]);

  const routeName = (id: string) => routes.data.find(r => r.id === id)?.name ?? '-';

  const columns: Column<AssignmentRow>[] = [
    { key: 'student', title: 'Öğrenci', render: a => a.students ? `${a.students.first_name} ${a.students.last_name}` : '-' },
    { key: 'student_no', title: 'Okul No', render: a => a.students?.student_no || '-' },
    { key: 'route_id', title: 'Hat', render: a => routeName(a.route_id) },
    { key: 'direction', title: 'Yön', render: a => DIRECTION_LABELS[a.direction] },
    { key: 'guardian', title: 'Veli İletişim', render: a => a.students?.guardian_phone || '-' },
  ];

  const filtered = assignments.filter(a => {
    const n = `${a.students?.first_name ?? ''} ${a.students?.last_name ?? ''} ${a.students?.student_no ?? ''}`;
    return n.toLowerCase().includes(search.toLowerCase());
  });

  const createStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await students.create(studentForm);
    if (ok) { setStudentForm({ first_name: '', last_name: '', student_no: '', guardian_name: '', guardian_phone: '' }); setStudentOpen(false); }
  };

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.route_id || selected.length === 0) { toast.error('Hat ve en az bir öğrenci seçin'); return; }
    const route = routes.data.find(r => r.id === assignForm.route_id);
    if (!route) return;
    const rows = selected.map(sid => ({
      institution_id: route.institution_id,
      student_id: sid,
      route_id: route.id,
      stop_id: assignForm.stop_id === NONE ? null : assignForm.stop_id,
      direction: assignForm.direction,
    }));
    const { error } = await db.from('student_transport_assignments').upsert(rows, { onConflict: 'student_id,route_id,direction' });
    if (error) { toast.error(error.message); return; }
    toast.success(`${rows.length} öğrenci atandı`);
    setSelected([]);
    setAssignOpen(false);
    loadAssignments();
  };

  const removeAssignment = async (id: string) => {
    await db.from('student_transport_assignments').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id);
    loadAssignments();
  };

  return (
    <AdminLayout>
      <PageHeader title="Öğrenci Atama" description="Öğrencileri servis hatlarına ve duraklara atayın"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setStudentOpen(true)}><Users className="mr-2 h-4 w-4" />Öğrenci Ekle</Button>
            <Button className="min-h-11" onClick={() => setAssignOpen(true)}><Plus className="mr-2 h-4 w-4" />Servise Ata</Button>
          </div>
        } />

      <div className="mb-4 max-w-xs">
        <Select value={routeFilter || NONE} onValueChange={v => setRouteFilter(v === NONE ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Tüm hatlar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Tüm hatlar</SelectItem>
            {routes.data.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <DataTable columns={columns} data={filtered} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Öğrenci ara..."
          emptyTitle="Atama bulunamadı"
          actions={a => (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-11 w-11" title="Veli bağla" onClick={() => openGuardian(a)}>
                <UserPlus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => removeAssignment(a.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )} />
      </div>

      <FormModal open={!!guardianFor} onOpenChange={o => !o && setGuardianFor(null)} title="Veli Bağlantısı"
        description="Bağlı veli, öğrencisinin servis durumunu ve aktif seferin konumunu görebilir.">
        <div className="space-y-4">
          <div className="space-y-2">
            {links.length === 0 && <p className="text-sm text-muted-foreground">Bağlı veli yok.</p>}
            {links.map(l => {
              const p = profiles.find(x => x.user_id === l.user_id);
              return (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span className="text-sm truncate">
                    {p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Kullanıcı' : 'Kullanıcı'}
                    {l.relation ? ` · ${l.relation}` : ''}
                  </span>
                  <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => removeGuardian(l.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
          <form onSubmit={submitGuardian} className="space-y-4">
            <div className="space-y-2">
              <Label>Veli Kullanıcısı *</Label>
              <Select value={guardianForm.user_id} onValueChange={v => setGuardianForm({ ...guardianForm, user_id: v })}>
                <SelectTrigger className="min-h-11"><SelectValue placeholder="Kullanıcı seçin" /></SelectTrigger>
                <SelectContent>
                  {profiles.filter(p => !links.some(l => l.user_id === p.user_id)).map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Yakınlık</Label>
              <Input value={guardianForm.relation} onChange={e => setGuardianForm({ ...guardianForm, relation: e.target.value })} placeholder="Anne / Baba / Vasi" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setGuardianFor(null)}>Kapat</Button>
              <Button type="submit" disabled={!guardianForm.user_id}>Bağla</Button>
            </div>
          </form>
        </div>
      </FormModal>

      <FormModal open={studentOpen} onOpenChange={setStudentOpen} title="Yeni Öğrenci"
        description="Kimlik numarası bu ekranda tutulmaz; hassas alanlar ayrı korumalı alanda saklanır.">
        <form onSubmit={createStudent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Ad *</Label><Input value={studentForm.first_name} onChange={e => setStudentForm({ ...studentForm, first_name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Soyad *</Label><Input value={studentForm.last_name} onChange={e => setStudentForm({ ...studentForm, last_name: e.target.value })} required /></div>
          </div>
          <div className="space-y-2"><Label>Okul No</Label><Input value={studentForm.student_no} onChange={e => setStudentForm({ ...studentForm, student_no: e.target.value })} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Veli Adı</Label><Input value={studentForm.guardian_name} onChange={e => setStudentForm({ ...studentForm, guardian_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Veli Telefonu</Label><Input inputMode="tel" value={studentForm.guardian_phone} onChange={e => setStudentForm({ ...studentForm, guardian_phone: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStudentOpen(false)}>İptal</Button>
            <Button type="submit">Kaydet</Button>
          </div>
        </form>
      </FormModal>

      <FormModal open={assignOpen} onOpenChange={setAssignOpen} title="Servise Ata" description="Toplu veya tek öğrenci ataması yapabilirsiniz.">
        <form onSubmit={submitAssign} className="space-y-4">
          <div className="space-y-2">
            <Label>Hat *</Label>
            <Select value={assignForm.route_id} onValueChange={v => setAssignForm({ ...assignForm, route_id: v, stop_id: NONE })}>
              <SelectTrigger><SelectValue placeholder="Hat seçin" /></SelectTrigger>
              <SelectContent>
                {routes.data.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Durak</Label>
              <Select value={assignForm.stop_id} onValueChange={v => setAssignForm({ ...assignForm, stop_id: v })}>
                <SelectTrigger><SelectValue placeholder="Durak" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Seçilmedi</SelectItem>
                  {stops.map(s => <SelectItem key={s.id} value={s.id}>{s.order_index}. {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Yön</Label>
              <Select value={assignForm.direction} onValueChange={v => setAssignForm({ ...assignForm, direction: v as TransportDirection })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="to_school">Okula Gidiş</SelectItem>
                  <SelectItem value="to_home">Eve Dönüş</SelectItem>
                  <SelectItem value="both">Gidiş / Dönüş</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Öğrenciler</Label>
            <div className="border rounded-md max-h-60 overflow-y-auto divide-y">
              {students.data.length === 0 && <p className="p-3 text-sm text-muted-foreground">Önce öğrenci ekleyin.</p>}
              {students.data.map(s => (
                <label key={s.id} className="flex items-center gap-3 p-3 min-h-11 cursor-pointer">
                  <Checkbox checked={selected.includes(s.id)}
                    onCheckedChange={c => setSelected(prev => c ? [...prev, s.id] : prev.filter(x => x !== s.id))} />
                  <span className="text-sm">{s.first_name} {s.last_name}{s.student_no ? ` · ${s.student_no}` : ''}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>İptal</Button>
            <Button type="submit">Ata ({selected.length})</Button>
          </div>
        </form>
      </FormModal>
    </AdminLayout>
  );
}
