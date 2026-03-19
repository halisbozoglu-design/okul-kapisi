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

interface GradeLevel {
  id: string;
  institution_id: string;
  name: string;
  order_index: number;
  is_active: boolean;
}

export default function GradeLevelsPage() {
  const { data, loading, create, update, remove } = useCrud<GradeLevel>('grade_levels');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GradeLevel | null>(null);
  const [form, setForm] = useState({ name: '', order_index: 0, institution_id: '' });

  const filtered = data.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));

  const columns: Column<GradeLevel>[] = [
    { key: 'name', title: 'Sınıf Düzeyi' },
    { key: 'order_index', title: 'Sıra' },
    { key: 'is_active', title: 'Durum', render: (item) => <Badge variant={item.is_active ? 'default' : 'secondary'}>{item.is_active ? 'Aktif' : 'Pasif'}</Badge> },
  ];

  const openCreate = () => { setEditing(null); setForm({ name: '', order_index: 0, institution_id: '' }); setModalOpen(true); };
  const openEdit = (item: GradeLevel) => { setEditing(item); setForm({ name: item.name, order_index: item.order_index, institution_id: item.institution_id }); setModalOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = editing ? await update(editing.id, form) : await create(form);
    if (success) setModalOpen(false);
  };

  return (
    <AdminLayout>
      <PageHeader title="Sınıf Düzeyleri" description="Sınıf düzeylerini yönetin" actions={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Yeni Düzey</Button>} />
      <DataTable columns={columns} data={filtered} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Sınıf düzeyi ara..."
        actions={(item) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />
      <FormModal open={modalOpen} onOpenChange={setModalOpen} title={editing ? 'Sınıf Düzeyini Düzenle' : 'Yeni Sınıf Düzeyi'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label>Ad *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-2"><Label>Sıra</Label><Input type="number" value={form.order_index} onChange={e => setForm({ ...form, order_index: parseInt(e.target.value) || 0 })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button type="submit">{editing ? 'Güncelle' : 'Oluştur'}</Button>
          </div>
        </form>
      </FormModal>
    </AdminLayout>
  );
}
