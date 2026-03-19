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

interface Term {
  id: string;
  academic_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export default function TermsPage() {
  const { data, loading, create, update, remove } = useCrud<Term>('terms');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Term | null>(null);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', academic_year_id: '' });

  const filtered = data.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));

  const columns: Column<Term>[] = [
    { key: 'name', title: 'Dönem Adı' },
    { key: 'start_date', title: 'Başlangıç' },
    { key: 'end_date', title: 'Bitiş' },
    { key: 'is_active', title: 'Durum', render: (item) => <Badge variant={item.is_active ? 'default' : 'secondary'}>{item.is_active ? 'Aktif' : 'Pasif'}</Badge> },
  ];

  const openCreate = () => { setEditing(null); setForm({ name: '', start_date: '', end_date: '', academic_year_id: '' }); setModalOpen(true); };
  const openEdit = (item: Term) => { setEditing(item); setForm({ name: item.name, start_date: item.start_date, end_date: item.end_date, academic_year_id: item.academic_year_id }); setModalOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = editing ? await update(editing.id, form) : await create(form);
    if (success) setModalOpen(false);
  };

  return (
    <AdminLayout>
      <PageHeader title="Dönemler" description="Dönem bilgilerini yönetin" actions={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Yeni Dönem</Button>} />
      <DataTable columns={columns} data={filtered} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Dönem ara..."
        actions={(item) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />
      <FormModal open={modalOpen} onOpenChange={setModalOpen} title={editing ? 'Dönemi Düzenle' : 'Yeni Dönem'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label>Dönem Adı *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Başlangıç *</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Bitiş *</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} required /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button type="submit">{editing ? 'Güncelle' : 'Oluştur'}</Button>
          </div>
        </form>
      </FormModal>
    </AdminLayout>
  );
}
