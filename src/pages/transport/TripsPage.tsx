import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { FormModal } from '@/components/common/FormModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History } from 'lucide-react';
import { db } from '@/lib/db';
import {
  TransportTrip, Route as RouteType, TripStatus, TRIP_STATUS_LABELS,
  DIRECTION_LABELS, EVENT_LABELS, TransportEventType,
} from '@/types/transport';

const ALL = '__all__';

interface EventRow {
  id: string; event_type: TransportEventType; occurred_at: string;
  student_id: string | null; students?: { first_name: string; last_name: string } | null;
}

export default function TripsPage() {
  const [trips, setTrips] = useState<TransportTrip[]>([]);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [status, setStatus] = useState<string>(ALL);
  const [detail, setDetail] = useState<TransportTrip | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    const load = async () => {
      let q = db.from('transport_trips').select('*').is('deleted_at', null)
        .order('started_at', { ascending: false }).limit(200);
      if (status !== ALL) q = q.eq('status', status);
      const [{ data: t }, { data: r }] = await Promise.all([
        q, db.from('routes').select('*').is('deleted_at', null),
      ]);
      setTrips((t || []) as TransportTrip[]);
      setRoutes((r || []) as RouteType[]);
    };
    load();
  }, [status]);

  const openDetail = async (trip: TransportTrip) => {
    setDetail(trip);
    const { data } = await db.from('transport_events')
      .select('id, event_type, occurred_at, student_id, students(first_name,last_name)')
      .eq('trip_id', trip.id).order('occurred_at', { ascending: true });
    setEvents((data || []) as EventRow[]);
  };

  const routeName = (id: string) => routes.find(r => r.id === id)?.name ?? '-';

  const columns: Column<TransportTrip>[] = [
    { key: 'route_id', title: 'Hat', render: t => routeName(t.route_id) },
    { key: 'direction', title: 'Yön', render: t => DIRECTION_LABELS[t.direction] },
    { key: 'started_at', title: 'Başlangıç', render: t => new Date(t.started_at).toLocaleString('tr-TR') },
    { key: 'ended_at', title: 'Bitiş', render: t => t.ended_at ? new Date(t.ended_at).toLocaleString('tr-TR') : '-' },
    {
      key: 'status', title: 'Durum',
      render: t => <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>{TRIP_STATUS_LABELS[t.status as TripStatus]}</Badge>,
    },
  ];

  return (
    <AdminLayout>
      <PageHeader title="Seferler" description="Geçmiş ve devam eden servis seferleri" />
      <div className="mb-4 max-w-xs">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm durumlar</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="completed">Tamamlandı</SelectItem>
            <SelectItem value="cancelled">İptal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <DataTable columns={columns} data={trips} emptyTitle="Sefer kaydı yok"
          actions={t => (
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openDetail(t)}>
              <History className="h-4 w-4" />
            </Button>
          )} />
      </div>

      <FormModal open={!!detail} onOpenChange={o => !o && setDetail(null)}
        title="Sefer Hareketleri" description={detail ? routeName(detail.route_id) : ''}>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {events.length === 0 && <p className="text-sm text-muted-foreground">Kayıt bulunamadı.</p>}
          {events.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-2 border rounded-md p-2 text-sm">
              <span>
                {EVENT_LABELS[e.event_type]}
                {e.students ? ` · ${e.students.first_name} ${e.students.last_name}` : ''}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(e.occurred_at).toLocaleTimeString('tr-TR')}
              </span>
            </div>
          ))}
        </div>
      </FormModal>
    </AdminLayout>
  );
}
