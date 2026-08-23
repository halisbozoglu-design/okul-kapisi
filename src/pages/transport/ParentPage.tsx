import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Bus, CalendarOff, LogOut, MapPin, RefreshCw, Timer, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { deriveStudentStatus, groupEventsByStudent, DerivedStudentStatus } from '@/lib/transport/attendance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormModal } from '@/components/common/FormModal';
import { toast } from 'sonner';
import { estimateEta, formatDistance } from '@/lib/transport/eta';
import {
  ABSENCE_DIRECTION_LABELS, TransportAbsence, findActiveAbsence, toDateKey,
} from '@/lib/transport/absences';
import { DIRECTION_LABELS, TransportDirection, TransportEventType, TripStatus } from '@/types/transport';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface ChildRow {
  student_id: string;
  institution_id: string;
  relation: string | null;
  first_name: string;
  last_name: string;
  student_no: string | null;
}

interface AssignmentRow {
  student_id: string;
  route_id: string;
  stop_id: string | null;
  direction: TransportDirection;
}

interface TripRow {
  id: string;
  route_id: string;
  direction: TransportDirection;
  status: TripStatus;
  started_at: string;
  ended_at: string | null;
  vehicle_id: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_speed: number | null;
  last_location_at: string | null;
}

interface EventRow {
  student_id: string | null;
  trip_id: string;
  event_type: TransportEventType;
  occurred_at: string;
}

interface StopRow { id: string; name: string; lat: number | null; lng: number | null }
interface RouteRow { id: string; name: string; vehicle_id: string | null }
interface VehicleRow { id: string; plate: string; service_no: string }

const toneVariant: Record<DerivedStudentStatus['tone'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  neutral: 'secondary',
  positive: 'default',
  warning: 'outline',
  danger: 'destructive',
};

function freshness(iso: string | null) {
  if (!iso) return 'konum yok';
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff} sn önce`;
  if (diff < 3600) return `${Math.round(diff / 60)} dk önce`;
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export default function ParentPage() {
  const { user, signOut } = useAuth();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [absences, setAbsences] = useState<TransportAbsence[]>([]);
  const [absenceForm, setAbsenceForm] = useState<{ child: ChildRow } | null>(null);
  const [absenceDate, setAbsenceDate] = useState(toDateKey(new Date()));
  const [absenceDirection, setAbsenceDirection] = useState<TransportDirection>('both');
  const [absenceReason, setAbsenceReason] = useState('');
  const [savingAbsence, setSavingAbsence] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: links } = await db
      .from('student_guardians')
      .select('student_id, relation')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('deleted_at', null);

    const studentIds = ((links || []) as { student_id: string }[]).map(l => l.student_id);
    if (studentIds.length === 0) {
      setChildren([]); setLoading(false); return;
    }

    const { data: students } = await db
      .from('students')
      .select('id, institution_id, first_name, last_name, student_no')
      .in('id', studentIds)
      .is('deleted_at', null);

    const relations = Object.fromEntries(
      ((links || []) as { student_id: string; relation: string | null }[]).map(l => [l.student_id, l.relation]),
    );
    setChildren(((students || []) as { id: string; institution_id: string; first_name: string; last_name: string; student_no: string | null }[])
      .map(s => ({
        student_id: s.id,
        institution_id: s.institution_id,
        first_name: s.first_name,
        last_name: s.last_name,
        student_no: s.student_no,
        relation: relations[s.id] ?? null,
      })));

    const { data: assignRows } = await db
      .from('student_transport_assignments')
      .select('student_id, route_id, stop_id, direction')
      .in('student_id', studentIds)
      .eq('is_active', true)
      .is('deleted_at', null);
    const assigns = (assignRows || []) as AssignmentRow[];
    setAssignments(assigns);

    const routeIds = [...new Set(assigns.map(a => a.route_id))];
    const stopIds = assigns.map(a => a.stop_id).filter(Boolean) as string[];

    const [routeRes, stopRes, tripRes, eventRes] = await Promise.all([
      routeIds.length
        ? db.from('routes').select('id, name, vehicle_id').in('id', routeIds)
        : Promise.resolve({ data: [] }),
      stopIds.length
        ? db.from('route_stops').select('id, name, lat, lng').in('id', stopIds)
        : Promise.resolve({ data: [] }),
      routeIds.length
        ? db.from('transport_trips')
            .select('id, route_id, direction, status, started_at, ended_at, vehicle_id, last_lat, last_lng, last_speed, last_location_at')
            .in('route_id', routeIds)
            .order('started_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      db.from('transport_events')
        .select('student_id, trip_id, event_type, occurred_at')
        .in('student_id', studentIds)
        .order('occurred_at', { ascending: true }),
    ]);

    const routeRows = (routeRes.data || []) as RouteRow[];
    setRoutes(routeRows);
    setStops((stopRes.data || []) as StopRow[]);
    setTrips((tripRes.data || []) as TripRow[]);
    setEvents((eventRes.data || []) as EventRow[]);

    const { data: absenceRows } = await db
      .from('transport_absences')
      .select('id, institution_id, student_id, absence_date, direction, reason, cancelled_at, deleted_at, created_at')
      .in('student_id', studentIds)
      .is('deleted_at', null)
      .gte('absence_date', toDateKey(new Date()))
      .order('absence_date', { ascending: true });
    setAbsences((absenceRows || []) as TransportAbsence[]);

    const vehicleIds = [...new Set([
      ...routeRows.map(r => r.vehicle_id),
      ...((tripRes.data || []) as TripRow[]).map(t => t.vehicle_id),
    ].filter(Boolean) as string[])];
    if (vehicleIds.length) {
      const { data: vs } = await db.from('vehicles').select('id, plate, service_no').in('id', vehicleIds);
      setVehicles((vs || []) as VehicleRow[]);
    } else {
      setVehicles([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: RLS remains the only security boundary (payload filters cannot express
  // guardian scope), but we ignore payloads outside our own children/routes so the
  // screen does not reload globally on unrelated traffic.
  useEffect(() => {
    if (!user) return;
    const studentIds = new Set(children.map(c => c.student_id));
    const routeIds = new Set(assignments.map(a => a.route_id));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 800);
    };
    const channel = supabase
      .channel('parent-transport')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_events' }, payload => {
        const row = (payload.new ?? payload.old) as { student_id?: string | null } | null;
        if (!row?.student_id || studentIds.has(row.student_id)) schedule();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_absences' }, payload => {
        const row = (payload.new ?? payload.old) as { student_id?: string | null } | null;
        if (!row?.student_id || studentIds.has(row.student_id)) schedule();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_trips' }, payload => {
        const row = (payload.new ?? payload.old) as { route_id?: string | null } | null;
        if (!row?.route_id || routeIds.has(row.route_id)) schedule();
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user, load, children, assignments]);

  const eventsByStudent = useMemo(() => groupEventsByStudent(events), [events]);

  const cards = useMemo(() => children.map(child => {
    const childAssignments = assignments.filter(a => a.student_id === child.student_id);
    const matches = (a: AssignmentRow, d: TransportDirection) =>
      a.direction === 'both' || d === 'both' || a.direction === d;

    // Pick the trip whose direction matches one of the child's assignments,
    // so a morning-only assignment never binds to the return trip (and vice versa).
    const candidates = trips.filter(t =>
      childAssignments.some(a => a.route_id === t.route_id && matches(a, t.direction)));
    const trip = candidates.find(t => t.status === 'active') ?? candidates[0] ?? null;

    const assignment = (trip
      ? childAssignments.find(a => a.route_id === trip.route_id && matches(a, trip.direction))
      : null) ?? childAssignments[0] ?? null;

    const route = assignment ? routes.find(r => r.id === assignment.route_id) ?? null : null;
    const stop = assignment?.stop_id ? stops.find(s => s.id === assignment.stop_id) ?? null : null;
    const childEvents = (eventsByStudent[child.student_id] ?? []).filter(e => !trip || e.trip_id === trip.id);
    const derived = deriveStudentStatus({
      events: childEvents,
      tripStatus: trip?.status ?? null,
      direction: trip?.direction ?? assignment?.direction ?? null,
    });
    const vehicle = vehicles.find(v => v.id === (trip?.vehicle_id ?? route?.vehicle_id)) ?? null;

    const todayKey = toDateKey(new Date());
    const activeDirection = trip?.direction ?? assignment?.direction ?? null;
    const todayAbsence = findActiveAbsence(absences, child.student_id, todayKey, activeDirection);
    const upcoming = absences.filter(a =>
      a.student_id === child.student_id && a.cancelled_at == null && a.deleted_at == null);

    const eta = trip?.status === 'active' && !todayAbsence
      ? estimateEta({
          vehicle: trip.last_lat != null && trip.last_lng != null
            ? { lat: trip.last_lat, lng: trip.last_lng } : null,
          stop: stop?.lat != null && stop?.lng != null ? { lat: stop.lat, lng: stop.lng } : null,
          lastLocationAt: trip.last_location_at,
          lastSpeedMs: trip.last_speed,
        })
      : ({ available: false } as ReturnType<typeof estimateEta>);

    return { child, assignment, route, stop, trip, derived, vehicle, todayAbsence, upcoming, eta };
  }), [children, assignments, routes, stops, trips, vehicles, eventsByStudent, absences]);

  const openAbsenceForm = (child: ChildRow) => {
    setAbsenceDate(toDateKey(new Date()));
    setAbsenceDirection('both');
    setAbsenceReason('');
    setAbsenceForm({ child });
  };

  const submitAbsence = async () => {
    if (!absenceForm || !user) return;
    setSavingAbsence(true);
    const { error } = await db.from('transport_absences').insert({
      institution_id: absenceForm.child.institution_id,
      student_id: absenceForm.child.student_id,
      absence_date: absenceDate,
      direction: absenceDirection,
      reason: absenceReason.trim() || null,
      created_by: user.id,
    });
    setSavingAbsence(false);
    if (error) {
      toast.error(error.code === '23505'
        ? 'Bu tarih ve yön için zaten bir bildirim var.'
        : 'Bildirim kaydedilemedi.');
      return;
    }
    setAbsenceForm(null);
    toast.success('Bildirim kaydedildi');
    load();
  };

  const cancelAbsence = async (absence: TransportAbsence) => {
    const { error } = await db.from('transport_absences')
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null })
      .eq('id', absence.id);
    if (error) { toast.error('Bildirim iptal edilemedi.'); return; }
    toast.success('Bildirim iptal edildi');
    load();
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-16">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Bus className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">Servis Takibi</p>
            <p className="text-xs opacity-80">Veli Ekranı</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-11 w-11 text-primary-foreground"
            onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-11 w-11 text-primary-foreground" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="p-3 space-y-3 max-w-md mx-auto">
        {cards.length === 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Hesabınıza bağlı öğrenci bulunmuyor. Okul yönetiminden hesabınızın
                öğrenciye bağlanmasını isteyin.
              </p>
              <Button asChild variant="outline" className="w-full min-h-11">
                <Link to="/dashboard">Panele Dön</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {cards.map(({ child, assignment, route, stop, trip, derived, vehicle, todayAbsence, upcoming, eta }) => {
          const hasLive = trip?.status === 'active' && trip.last_lat != null && trip.last_lng != null;
          const center: [number, number] = hasLive
            ? [trip!.last_lat as number, trip!.last_lng as number]
            : stop?.lat != null && stop?.lng != null
              ? [stop.lat, stop.lng]
              : [39.925, 32.866];
          return (
            <Card key={child.student_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-start justify-between gap-2">
                  <span className="truncate">{child.first_name} {child.last_name}</span>
                  <Badge variant={todayAbsence ? 'outline' : toneVariant[derived.tone]} className="shrink-0">
                    {todayAbsence ? 'Servis kullanmayacak' : derived.label}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Hat</dt>
                  <dd className="text-right font-medium truncate">{route?.name ?? 'Atanmadı'}</dd>
                  <dt className="text-muted-foreground">Yön</dt>
                  <dd className="text-right font-medium">
                    {trip ? DIRECTION_LABELS[trip.direction] : assignment ? DIRECTION_LABELS[assignment.direction] : '-'}
                  </dd>
                  <dt className="text-muted-foreground">Durak</dt>
                  <dd className="text-right font-medium truncate">{stop?.name ?? '-'}</dd>
                  <dt className="text-muted-foreground">Araç</dt>
                  <dd className="text-right font-medium truncate">
                    {vehicle ? `${vehicle.service_no} · ${vehicle.plate}` : '-'}
                  </dd>
                  <dt className="text-muted-foreground">Son hareket</dt>
                  <dd className="text-right font-medium">
                    {derived.lastEventAt
                      ? new Date(derived.lastEventAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                      : '-'}
                  </dd>
                  <dt className="text-muted-foreground">Konum güncelliği</dt>
                  <dd className="text-right font-medium">{trip ? freshness(trip.last_location_at) : '-'}</dd>
                </dl>

                {eta.available && (
                  <div className={`rounded-lg border p-3 text-xs flex items-start gap-2 ${eta.approaching ? 'border-primary bg-primary/5' : ''}`}>
                    <Timer className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {eta.approaching ? 'Servis yaklaşıyor' : 'Tahmini varış'} · {eta.label}
                      </p>
                      <p className="text-muted-foreground">
                        Durağa {formatDistance(eta.distanceMeters!)} · {eta.usedGpsSpeed ? 'anlık hıza' : 'ortalama şehir içi hıza'} göre
                        yaklaşık hesap. Trafik ve durak molaları dahil değildir.
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <CalendarOff className="h-3.5 w-3.5" />Servis kullanmama bildirimi
                    </p>
                    <Button size="sm" variant="outline" className="h-9 text-xs"
                      onClick={() => openAbsenceForm(child)}>Bildir</Button>
                  </div>
                  {upcoming.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Aktif bildirim yok.</p>
                  ) : upcoming.map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">
                          {new Date(`${a.absence_date}T00:00:00`).toLocaleDateString('tr-TR')} · {ABSENCE_DIRECTION_LABELS[a.direction]}
                        </p>
                        {a.reason && <p className="text-[11px] text-muted-foreground truncate">{a.reason}</p>}
                      </div>
                      <Button size="sm" variant="ghost" className="h-9 px-2 text-xs shrink-0"
                        onClick={() => cancelAbsence(a)}>
                        <Undo2 className="h-3.5 w-3.5 mr-1" />İptal
                      </Button>
                    </div>
                  ))}
                </div>

                {trip?.status === 'active' ? (
                  <div className="h-56 rounded-lg overflow-hidden border">
                    <MapContainer center={center} zoom={14} className="h-full w-full" scrollWheelZoom={false}>
                      <TileLayer
                        attribution='&copy; OpenStreetMap katkıda bulunanlar'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {hasLive && (
                        <Marker position={[trip.last_lat as number, trip.last_lng as number]}>
                          <Popup>
                            <div className="text-sm">
                              <p className="font-medium">{vehicle ? vehicle.plate : 'Servis aracı'}</p>
                              <p>{freshness(trip.last_location_at)}</p>
                            </div>
                          </Popup>
                        </Marker>
                      )}
                      {stop?.lat != null && stop?.lng != null && (
                        <Marker position={[stop.lat, stop.lng]}>
                          <Popup><span className="text-sm">Durak: {stop.name}</span></Popup>
                        </Marker>
                      )}
                    </MapContainer>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Şu anda aktif sefer yok. Sefer başladığında konum burada görünecek.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <FormModal
          open={!!absenceForm}
          onOpenChange={o => { if (!o) setAbsenceForm(null); }}
          title="Servis kullanmayacağım"
          description={absenceForm ? `${absenceForm.child.first_name} ${absenceForm.child.last_name} için bildirim oluşturun.` : undefined}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="absence-date">Tarih</Label>
              <Input
                id="absence-date" type="date" className="min-h-11"
                min={toDateKey(new Date())}
                value={absenceDate}
                onChange={e => setAbsenceDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Yön</Label>
              <Select value={absenceDirection} onValueChange={v => setAbsenceDirection(v as TransportDirection)}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">{ABSENCE_DIRECTION_LABELS.both}</SelectItem>
                  <SelectItem value="to_school">{ABSENCE_DIRECTION_LABELS.to_school}</SelectItem>
                  <SelectItem value="to_home">{ABSENCE_DIRECTION_LABELS.to_home}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="absence-reason">Açıklama (opsiyonel)</Label>
              <Input id="absence-reason" className="min-h-11" maxLength={200}
                value={absenceReason} onChange={e => setAbsenceReason(e.target.value)}
                placeholder="Örn: Doktor randevusu" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 min-h-11" onClick={() => setAbsenceForm(null)}>Vazgeç</Button>
              <Button className="flex-1 min-h-11" disabled={savingAbsence || !absenceDate} onClick={submitAbsence}>
                Kaydet
              </Button>
            </div>
          </div>
        </FormModal>

        <p className="text-[11px] text-muted-foreground text-center px-2">
          Konum yalnızca aktif sefer sırasında ve şoför telefonunun ekranı açıkken güncellenir.
        </p>
      </main>
    </div>
  );
}
