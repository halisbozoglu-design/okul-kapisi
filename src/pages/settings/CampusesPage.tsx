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

interface Campus {
  id: string;
  institution_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

export default function CampusesPage() {
  const { data, loading, create, update, remove } = useCrud<Campus>('campuses');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', institution_id: '' });

  const filtered = data.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));

  const columns: Column<Campus>[] = [
    { key: 'name', title: 'Kampüs Adı' },
    { key: 'address', title: 'Adres' },
    { key: 'phone', title: 'Telefon' },
    { key: 'is_active', title: 'Durum', render: (item) => <Badge variant={item.is_active ? 'default' : 'secondary'}>{item.is_active ? 'Aktif' : 'Pasif'}</Badge> },
  ];

  const openCreate = () => { setEditing(null); setForm({ name: '', address: '', phone: '', institution_id: '' }); setModalOpen(true); };
  const openEdit = (item: Campus) => { setEditing(item); setForm({ name: item.name, address: item.address || '', phone: item.phone || '', institution_id: item.institution_id }); setModalOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = editing ? await update(editing.id, form) : await create(form);
    if (success) setModalOpen(false);
  };

  return (
    <AdminLayout>
      <PageHeader title="Kampüsler" description="Kampüs bilgilerini yönetin" actions={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Yeni Kampüs</Button>} />
      <DataTable columns={columns} data={filtered} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Kampüs ara..."
        actions={(item) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />
      <FormModal open={modalOpen} onOpenChange={setModalOpen} title={editing ? 'Kampüsü Düzenle' : 'Yeni Kampüs'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label>Kampüs Adı *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-2"><Label>Adres</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-2"><Label>Telefon</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button type="submit">{editing ? 'Güncelle' : 'Oluştur'}</Button>
          </div>
        </form>
      </FormModal>
    </AdminLayout>
  );
}
