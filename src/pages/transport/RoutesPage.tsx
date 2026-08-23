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
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react';
import { useTransportCrud } from '@/hooks/useTransportCrud';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import {
  Route as RouteType, RouteStop, Vehicle, TransportStaff,
  DIRECTION_LABELS, TransportDirection,
} from '@/types/transport';

const NONE = '__none__';
const emptyRoute = {
  name: '', code: '', direction: 'both' as TransportDirection,
  vehicle_id: NONE, driver_staff_id: NONE, attendant_staff_id: NONE, description: '',
};

export default function RoutesPage() {
  const routes = useTransportCrud<RouteType>('routes', { orderBy: 'name', ascending: true });
  const vehicles = useTransportCrud<Vehicle>('vehicles', { orderBy: 'service_no', ascending: true });
  const staff = useTransportCrud<TransportStaff>('transport_staff', { orderBy: 'full_name', ascending: true });

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RouteType | null>(null);
  const [form, setForm] = useState({ ...emptyRoute });

  const [stopsRoute, setStopsRoute] = useState<RouteType | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [stopForm, setStopForm] = useState({ name: '', order_index: '', lat: '', lng: '', planned_time: '' });

  const vehicleLabel = (id: string | null) => {
    const v = vehicles.data.find(x => x.id === id);
    return v ? `${v.service_no} · ${v.plate}` : '-';
  };
  const staffLabel = (id: string | null) => staff.data.find(x => x.id === id)?.full_name ?? '-';

  const filtered = routes.data.filter(r => `${r.name} ${r.code ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  const columns: Column<RouteType>[] = [
    { key: 'name', title: 'Hat Adı' },
    { key: 'code', title: 'Kod', render: r => r.code || '-' },
    { key: 'direction', title: 'Yön', render: r => DIRECTION_LABELS[r.direction] },
    { key: 'vehicle_id', title: 'Araç', render: r => vehicleLabel(r.vehicle_id) },
    { key: 'driver_staff_id', title: 'Şoför', render: r => staffLabel(r.driver_staff_id) },
    { key: 'is_active', title: 'Durum', render: r => <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Aktif' : 'Pasif'}</Badge> },
  ];

  const openCreate = () => { setEditing(null); setForm({ ...emptyRoute }); setOpen(true); };
  const openEdit = (r: RouteType) => {
    setEditing(r);
    setForm({
      name: r.name, code: r.code ?? '', direction: r.direction,
      vehicle_id: r.vehicle_id ?? NONE, driver_staff_id: r.driver_staff_id ?? NONE,
      attendant_staff_id: r.attendant_staff_id ?? NONE, description: r.description ?? '',
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      vehicle_id: form.vehicle_id === NONE ? null : form.vehicle_id,
      driver_staff_id: form.driver_staff_id === NONE ? null : form.driver_staff_id,
      attendant_staff_id: form.attendant_staff_id === NONE ? null : form.attendant_staff_id,
    };
    const ok = editing ? await routes.update(editing.id, payload) : await routes.create(payload);
    if (ok) setOpen(false);
  };

  const loadStops = async (route: RouteType) => {
    setStopsRoute(route);
    const { data } = await db.from('route_stops').select('*').eq('route_id', route.id)
      .is('deleted_at', null).order('order_index', { ascending: true });
    setStops((data || []) as RouteStop[]);
  };

  const addStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stopsRoute) return;
    const { error } = await db.from('route_stops').insert({
      institution_id: stopsRoute.institution_id,
      route_id: stopsRoute.id,
      name: stopForm.name,
      order_index: stopForm.order_index ? Number(stopForm.order_index) : stops.length + 1,
      lat: stopForm.lat ? Number(stopForm.lat) : null,
      lng: stopForm.lng ? Number(stopForm.lng) : null,
      planned_time: stopForm.planned_time || null,
    });
    if (error) { toast.error(error.message); return; }
    setStopForm({ name: '', order_index: '', lat: '', lng: '', planned_time: '' });
    toast.success('Durak eklendi');
    loadStops(stopsRoute);
  };

  const deleteStop = async (id: string) => {
    await db.from('route_stops').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id);
    if (stopsRoute) loadStops(stopsRoute);
  };

  return (
    <AdminLayout>
      <PageHeader title="Hatlar & Duraklar" description="Servis hatlarını, araç/personel eşleşmesini ve duraklarını yönetin"
        actions={<Button onClick={openCreate} className="min-h-11"><Plus className="mr-2 h-4 w-4" />Yeni Hat</Button>} />
      <div className="overflow-x-auto">
        <DataTable columns={columns} data={filtered} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Hat ara..."
          actions={r => (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-11 w-11" title="Duraklar" onClick={() => loadStops(r)}><MapPin className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => routes.remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          )} />
      </div>

      <FormModal open={open} onOpenChange={setOpen} title={editing ? 'Hattı Düzenle' : 'Yeni Hat'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Hat Adı *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Kod</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          <div className="space-y-2">
            <Label>Yön</Label>
            <Select value={form.direction} onValueChange={v => setForm({ ...form, direction: v as TransportDirection })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="to_school">Okula Gidiş</SelectItem>
                <SelectItem value="to_home">Eve Dönüş</SelectItem>
                <SelectItem value="both">Gidiş / Dönüş</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Araç</Label>
            <Select value={form.vehicle_id} onValueChange={v => setForm({ ...form, vehicle_id: v })}>
              <SelectTrigger><SelectValue placeholder="Seçiniz" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Seçilmedi</SelectItem>
                {vehicles.data.map(v => <SelectItem key={v.id} value={v.id}>{v.service_no} · {v.plate}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Şoför</Label>
              <Select value={form.driver_staff_id} onValueChange={v => setForm({ ...form, driver_staff_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seçiniz" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Seçilmedi</SelectItem>
                  {staff.data.filter(s => s.staff_role === 'driver').map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rehber Personel</Label>
              <Select value={form.attendant_staff_id} onValueChange={v => setForm({ ...form, attendant_staff_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seçiniz" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Seçilmedi</SelectItem>
                  {staff.data.filter(s => s.staff_role === 'attendant').map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label>Açıklama</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit">{editing ? 'Güncelle' : 'Oluştur'}</Button>
          </div>
        </form>
      </FormModal>

      <FormModal open={!!stopsRoute} onOpenChange={o => !o && setStopsRoute(null)}
        title={`Duraklar · ${stopsRoute?.name ?? ''}`} description="Durak sırası şoför ekranındaki sırayı belirler.">
        <div className="space-y-4">
          <div className="space-y-2">
            {stops.length === 0 && <p className="text-sm text-muted-foreground">Henüz durak eklenmemiş.</p>}
            {stops.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 border rounded-md p-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.order_index}. {s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.planned_time ? `${s.planned_time} · ` : ''}{s.lat && s.lng ? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}` : 'konum yok'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => deleteStop(s.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <form onSubmit={addStop} className="space-y-3 border-t pt-4">
            <div className="space-y-2"><Label>Durak Adı *</Label><Input value={stopForm.name} onChange={e => setStopForm({ ...stopForm, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Sıra</Label><Input inputMode="numeric" value={stopForm.order_index} onChange={e => setStopForm({ ...stopForm, order_index: e.target.value })} /></div>
              <div className="space-y-2"><Label>Saat</Label><Input type="time" value={stopForm.planned_time} onChange={e => setStopForm({ ...stopForm, planned_time: e.target.value })} /></div>
              <div className="space-y-2"><Label>Enlem</Label><Input inputMode="decimal" value={stopForm.lat} onChange={e => setStopForm({ ...stopForm, lat: e.target.value })} /></div>
              <div className="space-y-2"><Label>Boylam</Label><Input inputMode="decimal" value={stopForm.lng} onChange={e => setStopForm({ ...stopForm, lng: e.target.value })} /></div>
            </div>
            <Button type="submit" className="w-full min-h-11"><Plus className="mr-2 h-4 w-4" />Durak Ekle</Button>
          </form>
        </div>
      </FormModal>
    </AdminLayout>
  );
}
