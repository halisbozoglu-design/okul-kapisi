import { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { FormModal } from '@/components/common/FormModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useTransportCrud } from '@/hooks/useTransportCrud';
import { Vehicle } from '@/types/transport';

const empty = {
  service_no: '', plate: '', brand: '', model: '', model_year: '', capacity: '', description: '',
};

export default function VehiclesPage() {
  const { data, create, update, remove } = useTransportCrud<Vehicle>('vehicles', { orderBy: 'service_no', ascending: true });
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({ ...empty });

  const filtered = data.filter(v =>
    `${v.service_no} ${v.plate} ${v.brand ?? ''} ${v.model ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  const columns: Column<Vehicle>[] = [
    { key: 'service_no', title: 'Servis No' },
    { key: 'plate', title: 'Plaka' },
    { key: 'brand', title: 'Marka / Model', render: v => [v.brand, v.model, v.model_year].filter(Boolean).join(' ') || '-' },
    { key: 'capacity', title: 'Kapasite', render: v => v.capacity ?? '-' },
    { key: 'is_active', title: 'Durum', render: v => <Badge variant={v.is_active ? 'default' : 'secondary'}>{v.is_active ? 'Aktif' : 'Pasif'}</Badge> },
  ];

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setOpen(true); };
  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({
      service_no: v.service_no, plate: v.plate, brand: v.brand ?? '', model: v.model ?? '',
      model_year: v.model_year ? String(v.model_year) : '', capacity: v.capacity ? String(v.capacity) : '',
      description: v.description ?? '',
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      model_year: form.model_year ? Number(form.model_year) : null,
      capacity: form.capacity ? Number(form.capacity) : null,
    };
    const ok = editing ? await update(editing.id, payload) : await create(payload);
    if (ok) setOpen(false);
  };

  return (
    <AdminLayout>
      <PageHeader title="Araçlar" description="Servis araçlarını yönetin"
        actions={<Button onClick={openCreate} className="min-h-11"><Plus className="mr-2 h-4 w-4" />Yeni Araç</Button>} />
      <div className="overflow-x-auto">
        <DataTable columns={columns} data={filtered} searchValue={search} onSearchChange={setSearch}
          searchPlaceholder="Servis no, plaka ara..."
          actions={v => (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => remove(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          )} />
      </div>
      <FormModal open={open} onOpenChange={setOpen} title={editing ? 'Aracı Düzenle' : 'Yeni Araç'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Servis No *</Label><Input value={form.service_no} onChange={e => setForm({ ...form, service_no: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Plaka *</Label><Input value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value.toUpperCase() })} required /></div>
            <div className="space-y-2"><Label>Marka</Label><Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} /></div>
            <div className="space-y-2"><Label>Model</Label><Input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
            <div className="space-y-2"><Label>Model Yılı</Label><Input inputMode="numeric" value={form.model_year} onChange={e => setForm({ ...form, model_year: e.target.value })} /></div>
            <div className="space-y-2"><Label>Kapasite</Label><Input inputMode="numeric" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label>Servis Tanımı</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit">{editing ? 'Güncelle' : 'Oluştur'}</Button>
          </div>
        </form>
      </FormModal>
    </AdminLayout>
  );
}
