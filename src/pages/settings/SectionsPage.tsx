import { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { FormModal } from '@/components/common/FormModal';
import { useCrud } from '@/hooks/useCrud';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Section {
  id: string;
  grade_level_id: string;
  name: string;
  capacity: number | null;
  is_active: boolean;
}

export default function SectionsPage() {
  const { data, loading, create, update, remove } = useCrud<Section>('sections');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [form, setForm] = useState({ name: '', capacity: '', grade_level_id: '' });

  const filtered = data.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));

  const columns: Column<Section>[] = [
    { key: 'name', title: 'Şube Adı' },
    { key: 'capacity', title: 'Kapasite' },
    { key: 'is_active', title: 'Durum', render: (item) => <Badge variant={item.is_active ? 'default' : 'secondary'}>{item.is_active ? 'Aktif' : 'Pasif'}</Badge> },
  ];

  const openCreate = () => { setEditing(null); setForm({ name: '', capacity: '', grade_level_id: '' }); setModalOpen(true); };
  const openEdit = (item: Section) => { setEditing(item); setForm({ name: item.name, capacity: item.capacity?.toString() || '', grade_level_id: item.grade_level_id }); setModalOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: form.name, grade_level_id: form.grade_level_id, capacity: form.capacity ? parseInt(form.capacity) : null };
    const success = editing ? await update(editing.id, payload) : await create(payload);
    if (success) setModalOpen(false);
  };

  return (
    <AdminLayout>
      <PageHeader title="Şubeler" description="Şube bilgilerini yönetin" actions={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Yeni Şube</Button>} />
      <DataTable columns={columns} data={filtered} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Şube ara..."
        actions={(item) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />
      <FormModal open={modalOpen} onOpenChange={setModalOpen} title={editing ? 'Şubeyi Düzenle' : 'Yeni Şube'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label>Şube Adı *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-2"><Label>Kapasite</Label><Input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button type="submit">{editing ? 'Güncelle' : 'Oluştur'}</Button>
          </div>
        </form>
      </FormModal>
    </AdminLayout>
  );
}
