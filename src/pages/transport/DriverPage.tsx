import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Bus, MapPin, Play, Square, Satellite, LogOut, Check, X, ArrowDownToLine, Wifi, WifiOff, CloudUpload } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import {
  BrowserGeolocationProvider, LocationSample, distanceMeters,
} from '@/lib/transport/locationProvider';
import {
  TransportStaff, Route as RouteType, TransportTrip, TransportDirection,
  DIRECTION_LABELS, Student, StudentAssignment, TransportEventType,
} from '@/types/transport';
import { TransportAbsence, findActiveAbsence, toDateKey } from '@/lib/transport/absences';
import { selectApproachingCandidates } from '@/lib/transport/notifications';
import { LocationQueue, QueuedPing } from '@/lib/transport/locationQueue';

const MIN_INTERVAL_MS = 8000;
const MIN_DISTANCE_M = 20;
const FORCE_INTERVAL_MS = 30000;
const FLUSH_INTERVAL_MS = 20000;


/** Minimal, non-sensitive student projection used on the driver roll-call screen. */
type RollCallStudent = Pick<Student, 'id' | 'first_name' | 'last_name' | 'student_no'>;

type RollCallAssignment = Pick<
  StudentAssignment,
  'id' | 'student_id' | 'route_id' | 'stop_id' | 'direction'
>;

interface AssignmentRow extends RollCallAssignment { students?: RollCallStudent | null }

export default function DriverPage() {
  const { user, signOut } = useAuth();
  const [staff, setStaff] = useState<TransportStaff | null>(null);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [trip, setTrip] = useState<TransportTrip | null>(null);
  const [routeId, setRouteId] = useState('');
  const [direction, setDirection] = useState<TransportDirection>('to_school');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, TransportEventType>>({});
  const [absences, setAbsences] = useState<TransportAbsence[]>([]);
  const [sharing, setSharing] = useState(false);
  const [sample, setSample] = useState<LocationSample | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const providerRef = useRef(new BrowserGeolocationProvider());
  const lastSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const tripRef = useRef<TransportTrip | null>(null);
  tripRef.current = trip;
  /** stop coordinates for the current route (no student personal data) */
  const stopsRef = useRef<Record<string, { lat: number | null; lng: number | null }>>({});
  const assignmentsRef = useRef<AssignmentRow[]>([]);
  assignmentsRef.current = assignments;
  const statusesRef = useRef<Record<string, TransportEventType>>({});
  statusesRef.current = statuses;
  const absencesRef = useRef<TransportAbsence[]>([]);
  absencesRef.current = absences;
  /** approaching notifications already requested this session (trip:student) */
  const approachRequestedRef = useRef<Set<string>>(new Set());

  // Bootstrap: staff record, routes, active trip
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data: staffRows } = await db.from('transport_staff').select('*')
        .eq('user_id', user.id).is('deleted_at', null).limit(1);
      const me = (staffRows?.[0] ?? null) as TransportStaff | null;
      setStaff(me);
      if (me) {
        const { data: routeRows } = await db.from('routes').select('*')
          .is('deleted_at', null).eq('is_active', true).order('name');
        const mine = ((routeRows || []) as RouteType[])
          .filter(r => r.driver_staff_id === me.id || r.attendant_staff_id === me.id);
        setRoutes(mine);
        if (mine.length === 1) setRouteId(mine[0].id);

        const { data: tripRows } = await db.from('transport_trips').select('*')
          .eq('status', 'active').eq('driver_staff_id', me.id).is('deleted_at', null).order('started_at', { ascending: false }).limit(1);
        const active = (tripRows?.[0] ?? null) as TransportTrip | null;
        if (active) { setTrip(active); setRouteId(active.route_id); setDirection(active.direction); }
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const loadStudents = useCallback(async (activeTrip: TransportTrip) => {
    // Explicit columns only — no national_id / guardian_phone or other sensitive fields.
    const { data } = await db.from('student_transport_assignments')
      .select('id, student_id, route_id, stop_id, direction, students(id, first_name, last_name, student_no)')
      .eq('route_id', activeTrip.route_id)
      .eq('is_active', true)
      .is('deleted_at', null);
    const rows = ((data || []) as unknown as AssignmentRow[])
      .filter(a => a.direction === 'both' || a.direction === activeTrip.direction);
    setAssignments(rows);

    // Stop coordinates only — used locally to decide when to ask the server for
    // an "approaching" notification; guardian contact data is never fetched here.
    const { data: stopRows } = await db.from('route_stops')
      .select('id, lat, lng')
      .eq('route_id', activeTrip.route_id)
      .is('deleted_at', null);
    stopsRef.current = Object.fromEntries(
      ((stopRows || []) as { id: string; lat: number | null; lng: number | null }[])
        .map(s => [s.id, { lat: s.lat, lng: s.lng }]),
    );

    const { data: events } = await db.from('transport_events').select('student_id, event_type, occurred_at')
      .eq('trip_id', activeTrip.id).order('occurred_at', { ascending: true });
    const map: Record<string, TransportEventType> = {};
    (events || []).forEach((e: { student_id: string | null; event_type: TransportEventType }) => {
      if (e.student_id && ['BOARDING', 'NO_SHOW', 'DISEMBARK'].includes(e.event_type)) {
        map[e.student_id] = e.event_type;
      }
    });
    setStatuses(map);

    // Students whose guardian reported they will not use the service today.
    const studentIds = rows.map(r => r.student_id);
    if (studentIds.length) {
      const { data: absenceRows } = await db.from('transport_absences')
        .select('id, institution_id, student_id, absence_date, direction, reason, cancelled_at, deleted_at, created_at')
        .in('student_id', studentIds)
        .eq('absence_date', toDateKey(new Date()))
        .is('cancelled_at', null)
        .is('deleted_at', null);
      setAbsences((absenceRows || []) as TransportAbsence[]);
    } else {
      setAbsences([]);
    }
  }, []);

  useEffect(() => {
    approachRequestedRef.current = new Set();
    if (trip) loadStudents(trip);
  }, [trip?.id, loadStudents]); // eslint-disable-line

  const logEvent = async (
    type: TransportEventType,
    extra: Record<string, unknown> = {},
    tripOverride?: TransportTrip,
  ): Promise<boolean> => {
    const t = tripOverride ?? tripRef.current;
    if (!t) return false;
    const { error } = await db.from('transport_events').insert({
      institution_id: t.institution_id, trip_id: t.id, event_type: type,
      actor_user_id: user?.id ?? null,
      lat: sample?.lat ?? null, lng: sample?.lng ?? null,
      ...extra,
    });
    if (error) {
      console.error('transport_events insert failed', type, error);
      return false;
    }
    return true;
  };

  const pushLocation = useCallback(async (s: LocationSample) => {
    const t = tripRef.current;
    if (!t) return;
    const now = Date.now();
    const last = lastSentRef.current;
    if (last) {
      const elapsed = now - last.at;
      if (elapsed < MIN_INTERVAL_MS) return;
      const moved = distanceMeters(last, s);
      if (moved < MIN_DISTANCE_M && elapsed < FORCE_INTERVAL_MS) return;
    }
    lastSentRef.current = { at: now, lat: s.lat, lng: s.lng };
    const recordedAt = new Date(s.timestamp).toISOString();
    const { error } = await db.from('location_pings').insert({
      institution_id: t.institution_id, trip_id: t.id,
      lat: s.lat, lng: s.lng, accuracy: s.accuracy, speed: s.speed, heading: s.heading,
      recorded_at: recordedAt,
    });
    if (error) { console.error(error); return; }
    await db.from('transport_trips').update({
      last_lat: s.lat, last_lng: s.lng, last_accuracy: s.accuracy,
      last_speed: s.speed, last_heading: s.heading, last_location_at: recordedAt,
    }).eq('id', t.id);

    // Ask the server (security definer RPC, re-validates everything) to create
    // "approaching" notifications. Candidates are filtered locally first so the
    // RPC is called at most once per student per trip.
    const candidates = selectApproachingCandidates({
      tripId: t.id,
      tripDirection: t.direction,
      tripStatus: 'active',
      vehicle: { lat: s.lat, lng: s.lng },
      lastLocationAt: recordedAt,
      lastSpeedMs: s.speed,
      dateKey: toDateKey(new Date()),
      absences: absencesRef.current,
      alreadyRequested: approachRequestedRef.current,
      settledStudentIds: new Set(Object.keys(statusesRef.current)),
      students: assignmentsRef.current.map(a => {
        const stop = a.stop_id ? stopsRef.current[a.stop_id] : null;
        return {
          studentId: a.student_id,
          stop: stop && stop.lat != null && stop.lng != null
            ? { lat: stop.lat, lng: stop.lng } : null,
        };
      }),
    });
    for (const c of candidates) {
      approachRequestedRef.current.add(c.requestKey);
      const { error: rpcError } = await db.rpc('notify_transport_approaching', {
        _trip_id: t.id, _student_id: c.studentId,
      });
      if (rpcError) {
        approachRequestedRef.current.delete(c.requestKey);
        console.error('notify_transport_approaching failed', rpcError);
      }
    }
  }, []);

  const startSharing = useCallback(() => {
    setGeoError(null);
    providerRef.current.start(
      (s) => { setSample(s); pushLocation(s); },
      (err) => { setGeoError(err.message); if (err.code === 'permission_denied') setSharing(false); },
    );
    setSharing(true);
  }, [pushLocation]);

  const stopSharing = useCallback(() => {
    providerRef.current.stop();
    setSharing(false);
  }, []);

  useEffect(() => () => providerRef.current.stop(), []);

  const startTrip = async () => {
    if (!staff || !routeId) { toast.error('Hat seçin'); return; }
    if (trip) { toast.error('Zaten aktif bir seferiniz var'); return; }
    const route = routes.find(r => r.id === routeId);
    if (!route) return;
    setBusy(true);

    // Guard against a second active trip started from another device/tab.
    const { data: existing } = await db.from('transport_trips').select('id')
      .eq('status', 'active').eq('driver_staff_id', staff.id).is('deleted_at', null).limit(1);
    if (existing && existing.length > 0) {
      setBusy(false);
      toast.error('Bu şoför için zaten aktif bir sefer var. Sayfayı yenileyin.');
      return;
    }
    const { data, error } = await db.from('transport_trips').insert({
      institution_id: route.institution_id,
      route_id: route.id,
      vehicle_id: route.vehicle_id,
      driver_staff_id: staff.id,
      attendant_staff_id: route.attendant_staff_id,
      direction, status: 'active', started_by: user?.id ?? null,
    }).select('*').single();
    setBusy(false);
    if (error) {
      toast.error(
        error.code === '23505'
          ? 'Bu şoför için zaten aktif bir sefer var.'
          : error.message,
      );
      return;
    }
    const newTrip = data as TransportTrip;
    setTrip(newTrip);
    tripRef.current = newTrip;
    const logged = await logEvent('START_TRIP', {}, newTrip);
    if (!logged) toast.warning('Sefer başladı ancak başlangıç kaydı yazılamadı.');
    else toast.success('Sefer başladı');
    startSharing();
  };

  const endTrip = async () => {
    if (!trip) return;
    setBusy(true);
    const endLogged = await logEvent('END_TRIP');
    const { error } = await db.from('transport_trips').update({
      status: 'completed', ended_at: new Date().toISOString(), ended_by: user?.id ?? null,
    }).eq('id', trip.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!endLogged) toast.warning('Sefer kapandı ancak bitiş kaydı yazılamadı.');
    stopSharing();
    setTrip(null);
    tripRef.current = null;
    lastSentRef.current = null;
    setAssignments([]);
    setStatuses({});
    setAbsences([]);
    toast.success('Sefer tamamlandı');
  };

  const markStudent = async (studentId: string, type: TransportEventType) => {
    const previous = statuses[studentId];
    setStatuses(prev => ({ ...prev, [studentId]: type }));
    const ok = await logEvent(type, { student_id: studentId });
    if (!ok) {
      setStatuses(prev => {
        const next = { ...prev };
        if (previous) next[studentId] = previous; else delete next[studentId];
        return next;
      });
      toast.error('Yoklama kaydedilemedi, tekrar deneyin.');
    }
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  if (!staff) {
    return (
      <div className="min-h-screen p-4 grid place-items-center bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle>Şoför Ekranı</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bu hesap servis personeli olarak tanımlı değil. Okul yönetiminden hesabınızın
              servis personeline bağlanmasını isteyin.
            </p>
            <Button asChild variant="outline" className="w-full min-h-11"><Link to="/dashboard">Panele Dön</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const speedKmh = sample?.speed != null ? Math.max(0, sample.speed * 3.6) : null;

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Bus className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold truncate text-sm">{staff.full_name}</p>
            <p className="text-xs opacity-80">Şoför Ekranı</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11 text-primary-foreground" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="p-3 space-y-3 max-w-md mx-auto">
        {geoError && (
          <Alert variant="destructive">
            <AlertTitle>Konum Sorunu</AlertTitle>
            <AlertDescription className="text-sm">{geoError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              Sefer
              <Badge variant={trip ? 'default' : 'secondary'}>{trip ? 'Aktif' : 'Kapalı'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!trip ? (
              <>
                <Select value={routeId} onValueChange={setRouteId}>
                  <SelectTrigger className="min-h-11"><SelectValue placeholder="Hat seçin" /></SelectTrigger>
                  <SelectContent>
                    {routes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={direction} onValueChange={v => setDirection(v as TransportDirection)}>
                  <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="to_school">Okula Gidiş</SelectItem>
                    <SelectItem value="to_home">Eve Dönüş</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="w-full h-14 text-base" disabled={busy || !routeId} onClick={startTrip}>
                  <Play className="mr-2 h-5 w-5" />Seferi Başlat
                </Button>
                {routes.length === 0 && (
                  <p className="text-xs text-muted-foreground">Size atanmış aktif hat bulunmuyor.</p>
                )}
              </>
            ) : (
              <>
                <div className="text-sm">
                  <p className="font-medium">{routes.find(r => r.id === trip.route_id)?.name ?? 'Hat'}</p>
                  <p className="text-muted-foreground">{DIRECTION_LABELS[trip.direction]} · {new Date(trip.started_at).toLocaleTimeString('tr-TR')}</p>
                </div>
                <Button variant="destructive" className="w-full h-14 text-base" disabled={busy} onClick={endTrip}>
                  <Square className="mr-2 h-5 w-5" />Seferi Bitir
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Satellite className="h-4 w-4" />Konum Paylaşımı</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant={sharing ? 'outline' : 'default'}
              className="w-full h-12"
              disabled={!trip}
              onClick={() => (sharing ? stopSharing() : startSharing())}
            >
              <MapPin className="mr-2 h-4 w-4" />
              {sharing ? 'Paylaşımı Durdur' : 'Konum Paylaşımını Başlat'}
            </Button>
            {!trip && <p className="text-xs text-muted-foreground">Konum paylaşımı için önce seferi başlatın.</p>}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted p-2">
                <p className="text-xs text-muted-foreground">Hız</p>
                <p className="font-semibold text-sm">{speedKmh != null ? `${speedKmh.toFixed(0)} km/s` : '-'}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-xs text-muted-foreground">Doğruluk</p>
                <p className="font-semibold text-sm">{sample?.accuracy != null ? `${sample.accuracy.toFixed(0)} m` : '-'}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-xs text-muted-foreground">Yön</p>
                <p className="font-semibold text-sm">{sample?.heading != null ? `${sample.heading.toFixed(0)}°` : '-'}</p>
              </div>
            </div>
            {sample && (
              <p className="text-[11px] text-muted-foreground text-center">
                {sample.lat.toFixed(5)}, {sample.lng.toFixed(5)} · {new Date(sample.timestamp).toLocaleTimeString('tr-TR')}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Konum yalnızca sefer sırasında ve izniniz ile paylaşılır. Ekran kapalıyken telefon
              tarayıcısı konum göndermeyi durdurabilir; ekranı açık tutun.
            </p>
          </CardContent>
        </Card>

        {trip && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Öğrenci Yoklaması ({assignments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {assignments.length === 0 && <p className="text-sm text-muted-foreground">Bu hatta atanmış öğrenci yok.</p>}
              {assignments.map(a => {
                const s = a.students;
                const st = statuses[a.student_id];
                const absent = findActiveAbsence(absences, a.student_id, toDateKey(new Date()), trip.direction);
                return (
                  <div key={a.id} className={`rounded-lg border p-3 space-y-2 ${absent ? 'opacity-60 bg-muted/50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{s ? `${s.first_name} ${s.last_name}` : 'Öğrenci'}</p>
                      {absent
                        ? <Badge variant="outline" className="shrink-0">Kullanmayacak</Badge>
                        : st && <Badge variant={st === 'NO_SHOW' ? 'destructive' : 'default'}>
                            {st === 'BOARDING' ? 'Bindi' : st === 'NO_SHOW' ? 'Binmedi' : 'İndi'}
                          </Badge>}
                    </div>
                    {absent ? (
                      <p className="text-xs text-muted-foreground">
                        Veli bugün servis kullanılmayacağını bildirdi{absent.reason ? ` · ${absent.reason}` : ''}.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" variant={st === 'BOARDING' ? 'default' : 'outline'} className="h-11"
                          onClick={() => markStudent(a.student_id, 'BOARDING')}><Check className="h-4 w-4 mr-1" />Bindi</Button>
                        <Button size="sm" variant={st === 'NO_SHOW' ? 'destructive' : 'outline'} className="h-11"
                          onClick={() => markStudent(a.student_id, 'NO_SHOW')}><X className="h-4 w-4 mr-1" />Binmedi</Button>
                        <Button size="sm" variant={st === 'DISEMBARK' ? 'secondary' : 'outline'} className="h-11"
                          onClick={() => markStudent(a.student_id, 'DISEMBARK')}><ArrowDownToLine className="h-4 w-4 mr-1" />İndi</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
