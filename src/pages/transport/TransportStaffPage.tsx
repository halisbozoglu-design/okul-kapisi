import { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { FormModal } from '@/components/common/FormModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useTransportCrud } from '@/hooks/useTransportCrud';
import { TransportStaff, STAFF_ROLE_LABELS, TransportStaffRole } from '@/types/transport';

const empty = { full_name: '', phone: '', license_no: '', staff_role: 'driver' as TransportStaffRole, user_id: '', notes: '' };

export default function TransportStaffPage() {
  const { data, create, update, remove } = useTransportCrud<TransportStaff>('transport_staff', { orderBy: 'full_name', ascending: true });
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TransportStaff | null>(null);
  const [form, setForm] = useState({ ...empty });

  const filtered = data.filter(s => `${s.full_name} ${s.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  const columns: Column<TransportStaff>[] = [
    { key: 'full_name', title: 'Ad Soyad' },
    { key: 'staff_role', title: 'Görev', render: s => STAFF_ROLE_LABELS[s.staff_role] },
    { key: 'phone', title: 'Telefon', render: s => s.phone || '-' },
    { key: 'license_no', title: 'Ehliyet No', render: s => s.license_no || '-' },
    { key: 'user_id', title: 'Hesap', render: s => <Badge variant={s.user_id ? 'default' : 'secondary'}>{s.user_id ? 'Bağlı' : 'Bağlı değil'}</Badge> },
  ];

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setOpen(true); };
  const openEdit = (s: TransportStaff) => {
    setEditing(s);
    setForm({
      full_name: s.full_name, phone: s.phone ?? '', license_no: s.license_no ?? '',
      staff_role: s.staff_role, user_id: s.user_id ?? '', notes: s.notes ?? '',
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, user_id: form.user_id.trim() || null };
    const ok = editing ? await update(editing.id, payload) : await create(payload);
    if (ok) setOpen(false);
  };

  return (
    <AdminLayout>
      <PageHeader title="Şoför / Rehber Personel" description="Servis personelini yönetin ve kullanıcı hesaplarıyla eşleştirin"
        actions={<Button onClick={openCreate} className="min-h-11"><Plus className="mr-2 h-4 w-4" />Yeni Personel</Button>} />
      <div className="overflow-x-auto">
        <DataTable columns={columns} data={filtered} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Personel ara..."
          actions={s => (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          )} />
      </div>
      <FormModal open={open} onOpenChange={setOpen} title={editing ? 'Personeli Düzenle' : 'Yeni Personel'}
        description="Kimlik numarası gibi hassas alanlar liste ekranında gösterilmez.">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label>Ad Soyad *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Görev *</Label>
              <Select value={form.staff_role} onValueChange={v => setForm({ ...form, staff_role: v as TransportStaffRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver">Şoför</SelectItem>
                  <SelectItem value="attendant">Rehber Personel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Telefon</Label><Input inputMode="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label>Ehliyet No</Label><Input value={form.license_no} onChange={e => setForm({ ...form, license_no: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Kullanıcı Hesabı (user id)</Label>
            <Input value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} placeholder="Şoför ekranına giriş için gerekli" />
            <p className="text-xs text-muted-foreground">Personelin sisteme giriş yaptığı hesabın kullanıcı kimliği. Boş bırakılırsa şoför ekranını kullanamaz.</p>
          </div>
          <div className="space-y-2"><Label>Not</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit">{editing ? 'Güncelle' : 'Oluştur'}</Button>
          </div>
        </form>
      </FormModal>
    </AdminLayout>
  );
}
