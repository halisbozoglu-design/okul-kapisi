import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowDownToLine, Bus, Check, CloudUpload, LogOut, MapPin, Play, Satellite,
  Square, Wifi, WifiOff, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useInstitution } from '@/hooks/useInstitution';
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
import { deriveOnboardStudentIds, OnboardEventLike } from '@/lib/transport/onboard';
import {
  canBoardStudent, computeOccupancy, formatOccupancy, normalizeCapacity,
  type OccupancyState,
} from '@/lib/transport/occupancy';

const MIN_INTERVAL_MS = 8000;
const MIN_DISTANCE_M = 20;
const FORCE_INTERVAL_MS = 30000;
const FLUSH_INTERVAL_MS = 20000;

type RollCallStudent = Pick<Student, 'id' | 'first_name' | 'last_name' | 'student_no'>;
type RollCallAssignment = Pick<StudentAssignment, 'id' | 'student_id' | 'route_id' | 'stop_id' | 'direction'>;
interface AssignmentRow extends RollCallAssignment { students?: RollCallStudent | null }

export default function DriverPage() {
  const { user, signOut } = useAuth();
  const { institutionId, loading: institutionLoading } = useInstitution();
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
  const [checkOpen, setCheckOpen] = useState(false);
  const [pendingStudentIds, setPendingStudentIds] = useState<string[]>([]);
  const [finalCheckConfirmed, setFinalCheckConfirmed] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyState>(() => computeOccupancy([], null));
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const providerRef = useRef(new BrowserGeolocationProvider());
  const queueRef = useRef<LocationQueue>(new LocationQueue());
  const lastSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const tripRef = useRef<TransportTrip | null>(null);
  tripRef.current = trip;
  const stopsRef = useRef<Record<string, { lat: number | null; lng: number | null }>>({});
  const assignmentsRef = useRef<AssignmentRow[]>([]);
  assignmentsRef.current = assignments;
  const statusesRef = useRef<Record<string, TransportEventType>>({});
  statusesRef.current = statuses;
  const absencesRef = useRef<TransportAbsence[]>([]);
  absencesRef.current = absences;
  const approachRequestedRef = useRef<Set<string>>(new Set());
  const capacityRef = useRef<number | null>(null);
  capacityRef.current = capacity;
  const sampleRef = useRef<LocationSample | null>(null);
  sampleRef.current = sample;

  const clearTenantState = useCallback(() => {
    providerRef.current.stop();
    setSharing(false);
    setStaff(null);
    setRoutes([]);
    setTrip(null);
    tripRef.current = null;
    setRouteId('');
    setAssignments([]);
    setStatuses({});
    setAbsences([]);
    setSample(null);
    setGeoError(null);
    setPendingCount(0);
    setCapacity(null);
    capacityRef.current = null;
    setOccupancy(computeOccupancy([], null));
    setCapacityError(null);
    lastSentRef.current = null;
    stopsRef.current = {};
    approachRequestedRef.current = new Set();
  }, []);

  // Bootstrap is strictly tenant-bound. A multi-institution account can never
  // accidentally resolve the transport_staff row of another institution.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      clearTenantState();
      if (!user || !institutionId) {
        if (!cancelled) setLoading(false);
        return;
      }
      setLoading(true);

      const { data: staffRows, error: staffError } = await db.from('transport_staff')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(1);
      if (staffError) console.error('transport_staff read failed', staffError);
      const me = (staffRows?.[0] ?? null) as TransportStaff | null;
      if (cancelled) return;
      setStaff(me);

      if (me) {
        const { data: routeRows, error: routeError } = await db.from('routes')
          .select('*')
          .eq('institution_id', institutionId)
          .is('deleted_at', null)
          .eq('is_active', true)
          .order('name');
        if (routeError) console.error('routes read failed', routeError);
        const mine = ((routeRows || []) as RouteType[])
          .filter(r => r.driver_staff_id === me.id || r.attendant_staff_id === me.id);
        if (!cancelled) {
          setRoutes(mine);
          if (mine.length === 1) setRouteId(mine[0].id);
        }

        const { data: tripRows, error: tripError } = await db.from('transport_trips')
          .select('*')
          .eq('institution_id', institutionId)
          .eq('status', 'active')
          .eq('driver_staff_id', me.id)
          .is('deleted_at', null)
          .order('started_at', { ascending: false })
          .limit(1);
        if (tripError) console.error('active trip read failed', tripError);
        const active = (tripRows?.[0] ?? null) as TransportTrip | null;
        if (!cancelled && active) {
          setTrip(active);
          setRouteId(active.route_id);
          setDirection(active.direction);
        }
      }
      if (!cancelled) setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [user?.id, institutionId, clearTenantState]);

  const loadStudents = useCallback(async (activeTrip: TransportTrip) => {
    if (!institutionId || activeTrip.institution_id !== institutionId) return;
    const { data } = await db.from('student_transport_assignments')
      .select('id, student_id, route_id, stop_id, direction, students(id, first_name, last_name, student_no)')
      .eq('institution_id', institutionId)
      .eq('route_id', activeTrip.route_id)
      .eq('is_active', true)
      .is('deleted_at', null);
    const rows = ((data || []) as unknown as AssignmentRow[])
      .filter(a => a.direction === 'both' || a.direction === activeTrip.direction);
    setAssignments(rows);

    const { data: stopRows } = await db.from('route_stops')
      .select('id, lat, lng')
      .eq('institution_id', institutionId)
      .eq('route_id', activeTrip.route_id)
      .is('deleted_at', null);
    stopsRef.current = Object.fromEntries(
      ((stopRows || []) as { id: string; lat: number | null; lng: number | null }[])
        .map(s => [s.id, { lat: s.lat, lng: s.lng }]),
    );

    const { data: events } = await db.from('transport_events')
      .select('student_id, event_type, occurred_at, created_at')
      .eq('institution_id', institutionId)
      .eq('trip_id', activeTrip.id)
      .order('occurred_at', { ascending: true });
    const map: Record<string, TransportEventType> = {};
    (events || []).forEach((e: { student_id: string | null; event_type: TransportEventType }) => {
      if (e.student_id && ['BOARDING', 'NO_SHOW', 'DISEMBARK'].includes(e.event_type)) map[e.student_id] = e.event_type;
    });
    setStatuses(map);

    let cap: number | null = null;
    if (activeTrip.vehicle_id) {
      const { data: vehicleRows } = await db.from('vehicles')
        .select('id, capacity')
        .eq('institution_id', institutionId)
        .eq('id', activeTrip.vehicle_id)
        .limit(1);
      cap = normalizeCapacity((vehicleRows?.[0] as { capacity: number | null } | undefined)?.capacity);
    }
    setCapacity(cap);
    capacityRef.current = cap;
    setOccupancy(computeOccupancy((events || []) as OnboardEventLike[], cap));

    const studentIds = rows.map(r => r.student_id);
    if (studentIds.length) {
      const { data: absenceRows } = await db.from('transport_absences')
        .select('id, institution_id, student_id, absence_date, direction, reason, cancelled_at, deleted_at, created_at')
        .eq('institution_id', institutionId)
        .in('student_id', studentIds)
        .eq('absence_date', toDateKey(new Date()))
        .is('cancelled_at', null)
        .is('deleted_at', null);
      setAbsences((absenceRows || []) as TransportAbsence[]);
    } else setAbsences([]);
  }, [institutionId]);

  useEffect(() => {
    approachRequestedRef.current = new Set();
    if (trip) void loadStudents(trip);
  }, [trip?.id, loadStudents]);

  const logEvent = async (
    type: TransportEventType,
    extra: Record<string, unknown> = {},
    tripOverride?: TransportTrip,
  ): Promise<boolean> => {
    const t = tripOverride ?? tripRef.current;
    if (!t || !institutionId || t.institution_id !== institutionId) return false;
    const { error } = await db.from('transport_events').insert({
      institution_id: institutionId,
      trip_id: t.id,
      event_type: type,
      actor_user_id: user?.id ?? null,
      lat: sampleRef.current?.lat ?? null,
      lng: sampleRef.current?.lng ?? null,
      ...extra,
    });
    if (error) {
      console.error('transport_events insert failed', type, error);
      return false;
    }
    return true;
  };

  const sendPing = useCallback(async (p: QueuedPing) => {
    if (!institutionId || p.institutionId !== institutionId) return { ok: false };
    const { error } = await db.from('location_pings').insert({
      institution_id: p.institutionId,
      trip_id: p.tripId,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      speed: p.speed,
      heading: p.heading,
      recorded_at: p.recordedAt,
    });
    if (error) {
      console.warn('location ping kuyrukta bekliyor', error.message);
      return { ok: false };
    }
    return { ok: true };
  }, [institutionId]);

  const flushQueue = useCallback(async (s?: LocationSample | null) => {
    const t = tripRef.current;
    if (!t || !institutionId || t.institution_id !== institutionId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setPendingCount(await queueRef.current.size(t.id));
      return;
    }
    const res = await queueRef.current.flush(t.id, sendPing);
    setPendingCount(res.remaining);
    if (res.failed || res.sent === 0) return;
    setLastSyncAt(Date.now());

    const latest = s ?? sampleRef.current;
    if (!latest) return;
    const recordedAt = new Date(latest.timestamp).toISOString();
    const { error: updateError } = await db.from('transport_trips').update({
      last_lat: latest.lat,
      last_lng: latest.lng,
      last_accuracy: latest.accuracy,
      last_speed: latest.speed,
      last_heading: latest.heading,
      last_location_at: recordedAt,
    }).eq('institution_id', institutionId).eq('id', t.id);
    if (updateError) console.error('trip location summary update failed', updateError);

    const candidates = selectApproachingCandidates({
      tripId: t.id,
      tripDirection: t.direction,
      tripStatus: 'active',
      vehicle: { lat: latest.lat, lng: latest.lng },
      lastLocationAt: recordedAt,
      lastSpeedMs: latest.speed,
      dateKey: toDateKey(new Date()),
      absences: absencesRef.current,
      alreadyRequested: approachRequestedRef.current,
      settledStudentIds: new Set(Object.keys(statusesRef.current)),
      students: assignmentsRef.current.map(a => {
        const stop = a.stop_id ? stopsRef.current[a.stop_id] : null;
        return {
          studentId: a.student_id,
          stop: stop && stop.lat != null && stop.lng != null ? { lat: stop.lat, lng: stop.lng } : null,
        };
      }),
    });
    for (const c of candidates) {
      approachRequestedRef.current.add(c.requestKey);
      const { error: rpcError } = await db.rpc('notify_transport_approaching', {
        _trip_id: t.id,
        _student_id: c.studentId,
      });
      if (rpcError) {
        approachRequestedRef.current.delete(c.requestKey);
        console.error('notify_transport_approaching failed', rpcError);
      }
    }
  }, [institutionId, sendPing]);

  const pushLocation = useCallback(async (s: LocationSample) => {
    const t = tripRef.current;
    if (!t || !institutionId || t.institution_id !== institutionId) return;
    const now = Date.now();
    const last = lastSentRef.current;
    if (last) {
      const elapsed = now - last.at;
      if (elapsed < MIN_INTERVAL_MS) return;
      const moved = distanceMeters(last, s);
      if (moved < MIN_DISTANCE_M && elapsed < FORCE_INTERVAL_MS) return;
    }
    lastSentRef.current = { at: now, lat: s.lat, lng: s.lng };
    await queueRef.current.enqueue({
      tripId: t.id,
      institutionId,
      lat: s.lat,
      lng: s.lng,
      accuracy: s.accuracy,
      speed: s.speed,
      heading: s.heading,
      recordedAt: new Date(s.timestamp).toISOString(),
    });
    setPendingCount(await queueRef.current.size(t.id));
    await flushQueue(s);
  }, [institutionId, flushQueue]);

  const startSharing = useCallback(() => {
    const t = tripRef.current;
    if (!t || !institutionId || t.institution_id !== institutionId) return;
    setGeoError(null);
    providerRef.current.start(
      s => { setSample(s); void pushLocation(s); },
      err => {
        setGeoError(err.message);
        if (err.code === 'permission_denied') setSharing(false);
      },
    );
    setSharing(true);
  }, [institutionId, pushLocation]);

  const stopSharing = useCallback(() => {
    providerRef.current.stop();
    setSharing(false);
  }, []);

  useEffect(() => () => providerRef.current.stop(), []);

  useEffect(() => {
    const goOnline = () => { setOnline(true); void flushQueue(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const id = window.setInterval(() => { void flushQueue(); }, FLUSH_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.clearInterval(id);
    };
  }, [flushQueue]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await queueRef.current.dropOtherTrips(trip?.id ?? null);
      const size = trip ? await queueRef.current.size(trip.id) : 0;
      if (!cancelled) setPendingCount(size);
    })();
    return () => { cancelled = true; };
  }, [trip?.id]);

  const startTrip = async () => {
    if (!institutionId || !staff || staff.institution_id !== institutionId || !routeId) {
      toast.error('Kurum ve hat seçimini kontrol edin');
      return;
    }
    if (trip) {
      toast.error('Zaten aktif bir seferiniz var');
      return;
    }
    const route = routes.find(r => r.id === routeId && r.institution_id === institutionId);
    if (!route) return;
    setBusy(true);

    const { data: existing } = await db.from('transport_trips').select('id')
      .eq('institution_id', institutionId)
      .eq('status', 'active')
      .eq('driver_staff_id', staff.id)
      .is('deleted_at', null)
      .limit(1);
    if (existing?.length) {
      setBusy(false);
      toast.error('Bu şoför için zaten aktif bir sefer var. Sayfayı yenileyin.');
      return;
    }

    const { data, error } = await db.from('transport_trips').insert({
      institution_id: institutionId,
      route_id: route.id,
      vehicle_id: route.vehicle_id,
      driver_staff_id: staff.id,
      attendant_staff_id: route.attendant_staff_id,
      direction,
      status: 'active',
      started_by: user?.id ?? null,
    }).select('*').single();
    setBusy(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Bu şoför için zaten aktif bir sefer var.' : error.message);
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

  const fetchTripEvents = async (tripId: string): Promise<OnboardEventLike[] | null> => {
    if (!institutionId) return null;
    const { data, error } = await db.from('transport_events')
      .select('student_id, event_type, occurred_at, created_at')
      .eq('institution_id', institutionId)
      .eq('trip_id', tripId)
      .order('occurred_at', { ascending: true });
    if (error) {
      console.error('transport_events read failed', error);
      return null;
    }
    return (data || []) as OnboardEventLike[];
  };

  const requestEndTrip = async () => {
    if (!trip) return;
    setBusy(true);
    const events = await fetchTripEvents(trip.id);
    setBusy(false);
    if (events === null) {
      toast.error('Güvenlik kontrolü yapılamadı. Sefer kapatılmadı, tekrar deneyin.');
      return;
    }
    setPendingStudentIds(deriveOnboardStudentIds(events));
    setFinalCheckConfirmed(false);
    setCheckOpen(true);
  };

  const finalizeEndTrip = async () => {
    if (!trip || !institutionId || trip.institution_id !== institutionId || !finalCheckConfirmed) return;
    setBusy(true);
    const events = await fetchTripEvents(trip.id);
    if (events === null) {
      setBusy(false);
      toast.error('Güvenlik kontrolü yapılamadı. Sefer kapatılmadı, tekrar deneyin.');
      return;
    }
    const onboard = deriveOnboardStudentIds(events);
    if (onboard.length > 0) {
      setPendingStudentIds(onboard);
      setBusy(false);
      toast.error('Araçta inişi kaydedilmemiş öğrenci var. Önce inişlerini kaydedin.');
      return;
    }

    const checkLogged = await logEvent('VEHICLE_CHECK', {
      note: JSON.stringify({ checked_at: new Date().toISOString(), actor_user_id: user?.id ?? null, pending_student_count: 0 }),
    });
    if (!checkLogged) {
      setBusy(false);
      toast.error('Son kontrol kaydı yazılamadı. Sefer kapatılmadı.');
      return;
    }

    await flushQueue();
    const endLogged = await logEvent('END_TRIP');
    const { error } = await db.from('transport_trips').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      ended_by: user?.id ?? null,
    }).eq('institution_id', institutionId).eq('id', trip.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!endLogged) toast.warning('Sefer kapandı ancak bitiş kaydı yazılamadı.');
    stopSharing();
    const stillQueued = await queueRef.current.size(trip.id);
    if (stillQueued > 0) toast.warning(`${stillQueued} konum kaydı gönderilemedi ve silindi.`);
    await queueRef.current.clear();
    clearTenantState();
    setLoading(false);
    toast.success('Sefer tamamlandı');
  };

  const markStudent = async (studentId: string, type: TransportEventType) => {
    const t = tripRef.current;
    if (!t || !institutionId || t.institution_id !== institutionId) return;
    setCapacityError(null);
    if (type === 'BOARDING') {
      const events = await fetchTripEvents(t.id);
      if (events === null) {
        toast.error('Doluluk doğrulanamadı. Biniş kaydedilmedi, tekrar deneyin.');
        return;
      }
      const decision = canBoardStudent(events, capacityRef.current, studentId);
      setOccupancy(decision.occupancy);
      if (!decision.allowed) {
        setCapacityError(decision.reason ?? 'Araç kapasitesi dolu.');
        toast.error(decision.reason ?? 'Araç kapasitesi dolu.');
        return;
      }
    }
    const ok = await logEvent(type, { student_id: studentId });
    if (!ok) {
      toast.error('Yoklama kaydedilemedi, tekrar deneyin.');
      return;
    }
    setStatuses(prev => ({ ...prev, [studentId]: type }));
    const events = await fetchTripEvents(t.id);
    if (events) setOccupancy(computeOccupancy(events, capacityRef.current));
  };

  if (loading || institutionLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  if (!institutionId) {
    return (
      <div className="min-h-screen p-4 grid place-items-center bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle>Şoför Ekranı</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Aktif kurum seçilemedi. Önce kurum üyeliğinizi veya aktif kurum seçiminizi kontrol edin.</p>
            <Button asChild variant="outline" className="w-full min-h-11"><Link to="/dashboard">Panele Dön</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="min-h-screen p-4 grid place-items-center bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle>Şoför Ekranı</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Bu hesap seçili kurumda aktif servis personeli olarak tanımlı değil.</p>
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
        {geoError && <Alert variant="destructive"><AlertTitle>Konum Sorunu</AlertTitle><AlertDescription className="text-sm">{geoError}</AlertDescription></Alert>}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center justify-between">Sefer<Badge variant={trip ? 'default' : 'secondary'}>{trip ? 'Aktif' : 'Kapalı'}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!trip ? (
              <>
                <Select value={routeId} onValueChange={setRouteId}>
                  <SelectTrigger className="min-h-11"><SelectValue placeholder="Hat seçin" /></SelectTrigger>
                  <SelectContent>{routes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={direction} onValueChange={v => setDirection(v as TransportDirection)}>
                  <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="to_school">Okula Gidiş</SelectItem><SelectItem value="to_home">Eve Dönüş</SelectItem></SelectContent>
                </Select>
                <Button className="w-full h-14 text-base" disabled={busy || !routeId} onClick={startTrip}><Play className="mr-2 h-5 w-5" />Seferi Başlat</Button>
                {routes.length === 0 && <p className="text-xs text-muted-foreground">Seçili kurumda size atanmış aktif hat bulunmuyor.</p>}
              </>
            ) : (
              <>
                <div className="text-sm">
                  <p className="font-medium">{routes.find(r => r.id === trip.route_id)?.name ?? 'Hat'}</p>
                  <p className="text-muted-foreground">{DIRECTION_LABELS[trip.direction]} · {new Date(trip.started_at).toLocaleTimeString('tr-TR')}</p>
                  <p className="mt-1 font-medium">Doluluk: {formatOccupancy(occupancy)}</p>
                  {occupancy.isOverflow && <p className="text-destructive font-medium">Kapasite aşıldı ({occupancy.overflowBy} kişi fazla).</p>}
                </div>
                <Button variant="destructive" className="w-full h-14 text-base" disabled={busy} onClick={requestEndTrip}><Square className="mr-2 h-5 w-5" />Seferi Bitir</Button>
                <p className="text-[11px] text-muted-foreground">Sefer, araç son kontrolü onaylanmadan kapatılmaz.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Satellite className="h-4 w-4" />Konum Paylaşımı</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button variant={sharing ? 'outline' : 'default'} className="w-full h-12" disabled={!trip} onClick={() => (sharing ? stopSharing() : startSharing())}>
              <MapPin className="mr-2 h-4 w-4" />{sharing ? 'Paylaşımı Durdur' : 'Konum Paylaşımını Başlat'}
            </Button>
            {!trip && <p className="text-xs text-muted-foreground">Konum paylaşımı için önce seferi başlatın.</p>}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Hız</p><p className="font-semibold text-sm">{speedKmh != null ? `${speedKmh.toFixed(0)} km/s` : '-'}</p></div>
              <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Doğruluk</p><p className="font-semibold text-sm">{sample?.accuracy != null ? `${sample.accuracy.toFixed(0)} m` : '-'}</p></div>
              <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Yön</p><p className="font-semibold text-sm">{sample?.heading != null ? `${sample.heading.toFixed(0)}°` : '-'}</p></div>
            </div>
            {sample && <p className="text-[11px] text-muted-foreground text-center">{sample.lat.toFixed(5)}, {sample.lng.toFixed(5)} · {new Date(sample.timestamp).toLocaleTimeString('tr-TR')}</p>}
            <div className="rounded-md border p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium">{online ? <><Wifi className="h-3.5 w-3.5 text-primary" />Çevrimiçi</> : <><WifiOff className="h-3.5 w-3.5 text-destructive" />Çevrimdışı</>}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CloudUpload className="h-3.5 w-3.5" />Bekleyen: {pendingCount}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Son başarılı gönderim: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('tr-TR') : '-'}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">Konum yalnızca seçili kurumdaki aktif sefer sırasında paylaşılır. Native Android/iOS uygulamasında arka plan konum sağlayıcısı kullanılabilir; tarayıcı/PWA arka planda işletim sistemi tarafından durdurulabilir.</p>
          </CardContent>
        </Card>

        {trip && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex flex-wrap items-center justify-between gap-2"><span>Öğrenci Yoklaması ({assignments.length})</span><Badge variant={occupancy.isOverflow ? 'destructive' : 'secondary'}>Doluluk: {formatOccupancy(occupancy)}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {capacityError && <Alert variant="destructive"><AlertTitle>Kapasite dolu</AlertTitle><AlertDescription className="text-sm">{capacityError} Önce inen öğrencilerin inişini kaydedin.</AlertDescription></Alert>}
              {assignments.length === 0 && <p className="text-sm text-muted-foreground">Bu hatta atanmış öğrenci yok.</p>}
              {assignments.map(a => {
                const s = a.students;
                const st = statuses[a.student_id];
                const absent = findActiveAbsence(absences, a.student_id, toDateKey(new Date()), trip.direction);
                return (
                  <div key={a.id} className={`rounded-lg border p-3 space-y-2 ${absent ? 'opacity-60 bg-muted/50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{s ? `${s.first_name} ${s.last_name}` : 'Öğrenci'}</p>
                      {absent ? <Badge variant="outline" className="shrink-0">Kullanmayacak</Badge> : st && <Badge variant={st === 'NO_SHOW' ? 'destructive' : 'default'}>{st === 'BOARDING' ? 'Bindi' : st === 'NO_SHOW' ? 'Binmedi' : 'İndi'}</Badge>}
                    </div>
                    {absent ? <p className="text-xs text-muted-foreground">Veli bugün servis kullanılmayacağını bildirdi{absent.reason ? ` · ${absent.reason}` : ''}.</p> : (
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" variant={st === 'BOARDING' ? 'default' : 'outline'} className="h-11" disabled={occupancy.isFull && !occupancy.onboardStudentIds.includes(a.student_id)} onClick={() => markStudent(a.student_id, 'BOARDING')}><Check className="h-4 w-4 mr-1" />Bindi</Button>
                        <Button size="sm" variant={st === 'NO_SHOW' ? 'destructive' : 'outline'} className="h-11" onClick={() => markStudent(a.student_id, 'NO_SHOW')}><X className="h-4 w-4 mr-1" />Binmedi</Button>
                        <Button size="sm" variant={st === 'DISEMBARK' ? 'secondary' : 'outline'} className="h-11" onClick={() => markStudent(a.student_id, 'DISEMBARK')}><ArrowDownToLine className="h-4 w-4 mr-1" />İndi</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={checkOpen} onOpenChange={o => { if (!busy) setCheckOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Araç Son Kontrolü</DialogTitle><DialogDescription>Sefer kapatılmadan önce araçta öğrenci kalmadığı doğrulanmalıdır.</DialogDescription></DialogHeader>
          {pendingStudentIds.length > 0 ? (
            <Alert variant="destructive"><AlertTitle>Araçta öğrenci görünüyor</AlertTitle><AlertDescription className="text-sm space-y-2"><p>Önce bu öğrencilerin inişini kaydedin:</p><ul className="list-disc pl-4">{pendingStudentIds.map(id => { const s = assignments.find(a => a.student_id === id)?.students; return <li key={id}>{s ? `${s.first_name} ${s.last_name}` : 'Öğrenci'}{s?.student_no ? ` · ${s.student_no}` : ''}</li>; })}</ul></AlertDescription></Alert>
          ) : (
            <label className="flex items-start gap-3 rounded-lg border p-3 min-h-11 cursor-pointer"><Checkbox className="mt-0.5 h-5 w-5" checked={finalCheckConfirmed} onCheckedChange={v => setFinalCheckConfirmed(v === true)} /><span className="text-sm leading-snug">Aracın önünden arkasına kadar kontrol ettim; araçta öğrenci kalmadığını doğruluyorum.</span></label>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => setCheckOpen(false)}>Vazgeç</Button>
            <Button className="min-h-11 w-full sm:w-auto" variant="destructive" disabled={busy || pendingStudentIds.length > 0 || !finalCheckConfirmed} onClick={finalizeEndTrip}>Son Kontrolü Onayla ve Seferi Bitir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
