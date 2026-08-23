import { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { FormModal } from '@/components/common/FormModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransportCrud } from '@/hooks/useTransportCrud';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface Loc {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  visitor_entry_enabled: boolean;
  student_duty_enabled: boolean;
  gender_rule: string;
  capacity: number | null;
  is_active: boolean;
}

const KIND_LABELS: Record<string, string> = {
  entrance: 'Giriş', exit: 'Çıkış', both: 'Giriş/Çıkış', duty_area: 'Nöbet Alanı',
};
const GENDER_LABELS: Record<string, string> = { any: 'Farketmez', male: 'Erkek', female: 'Kız' };

const empty = {
  name: '', code: '', kind: 'both', visitor_entry_enabled: true,
  student_duty_enabled: false, gender_rule: 'any', capacity: '',
};

export default function SecurityLocationsPage() {
  const { data, loading, create, update, remove } = useTransportCrud<Loc>('security_locations', { orderBy: 'name', ascending: true });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Loc | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [search, setSearch] = useState('');

  const openNew = () => { setEditing(null); setForm({ ...empty }); setOpen(true); };
  const openEdit = (l: Loc) => {
    setEditing(l);
    setForm({
      name: l.name, code: l.code ?? '', kind: l.kind,
      visitor_entry_enabled: l.visitor_entry_enabled, student_duty_enabled: l.student_duty_enabled,
      gender_rule: l.gender_rule, capacity: l.capacity ? String(l.capacity) : '',
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      kind: form.kind,
      visitor_entry_enabled: form.visitor_entry_enabled,
      student_duty_enabled: form.student_duty_enabled,
      gender_rule: form.gender_rule,
      capacity: form.capacity ? Number(form.capacity) : null,
    };
    const ok = editing ? await update(editing.id, payload) : await create(payload);
    if (ok) setOpen(false);
  };

  const filtered = data.filter((l) => l.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')));

  const columns: Column<Loc>[] = [
    { key: 'name', title: 'Ad' },
    { key: 'code', title: 'Kod', render: (l) => l.code ?? '—' },
    { key: 'kind', title: 'Tür', render: (l) => KIND_LABELS[l.kind] ?? l.kind },
    {
      key: 'flags', title: 'Kullanım', render: (l) => (
        <div className="flex flex-wrap gap-1">
          {l.visitor_entry_enabled && <Badge variant="secondary">Ziyaretçi</Badge>}
          {l.student_duty_enabled && <Badge>Nöbet</Badge>}
        </div>
      ),
    },
    { key: 'gender_rule', title: 'Cinsiyet Kuralı', render: (l) => GENDER_LABELS[l.gender_rule] ?? l.gender_rule },
    { key: 'capacity', title: 'Kapasite', render: (l) => l.capacity ?? '—' },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Giriş / Nöbet Yerleri"
        description="Ziyaretçi giriş noktaları ve nöbetçi öğrenci alanları"
        actions={<Button onClick={openNew} className="h-11"><Plus className="h-4 w-4 mr-2" />Yeni Yer</Button>}
      />
      {loading ? (
        <p className="text-muted-foreground">Yükleniyor...</p>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          searchValue={search}
          onSearchChange={setSearch}
          emptyTitle="Henüz kayıt yok"
          emptyDescription="İlk giriş noktanızı ekleyin."
          actions={(l) => (
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(l)} aria-label="Düzenle"><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(l.id)} aria-label="Sil"><Trash2 className="h-4 w-4" /></Button>
            </div>
          )}
        />
      )}

      <FormModal open={open} onOpenChange={setOpen} title={editing ? 'Yeri Düzenle' : 'Yeni Yer'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Ad *</Label>
            <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="code">Kod</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Kapasite</Label>
              <Input id="capacity" type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tür</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cinsiyet Kuralı</Label>
              <Select value={form.gender_rule} onValueChange={(v) => setForm({ ...form, gender_rule: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GENDER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="ve">Ziyaretçi girişi yapılabilir</Label>
            <Switch id="ve" checked={form.visitor_entry_enabled} onCheckedChange={(v) => setForm({ ...form, visitor_entry_enabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="sd">Nöbetçi öğrenci yeri</Label>
            <Switch id="sd" checked={form.student_duty_enabled} onCheckedChange={(v) => setForm({ ...form, student_duty_enabled: v })} />
          </div>
          <Button type="submit" className="w-full h-11">{editing ? 'Güncelle' : 'Kaydet'}</Button>
        </form>
      </FormModal>
    </AdminLayout>
  );
}
