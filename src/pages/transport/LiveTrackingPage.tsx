import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { AlertTriangle, Clock, MapPinOff, PauseCircle, Route as RouteIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { Route as RouteType, TransportTrip, Vehicle, DIRECTION_LABELS } from '@/types/transport';
import {
  computeTripAlerts,
  summarizeAlerts,
  worstSeverity,
  type PingSample,
  type SafetyAlert,
  type SafetySeverity,
  type StopCoord,
} from '@/lib/transport/safety';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface Ping { lat: number; lng: number; recorded_at: string }

const SEVERITY_STYLE: Record<SafetySeverity, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  warning: 'bg-amber-400 text-amber-950',
};
const SEVERITY_LABEL: Record<SafetySeverity, string> = {
  critical: 'Kritik',
  high: 'Yüksek',
  warning: 'Uyarı',
};

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    }
  }, [JSON.stringify(points)]); // eslint-disable-line
  return null;
}

export default function LiveTrackingPage() {
  const [trips, setTrips] = useState<TransportTrip[]>([]);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [trail, setTrail] = useState<Ping[]>([]);
  const [samples, setSamples] = useState<Record<string, PingSample[]>>({});
  const [stopsByRoute, setStopsByRoute] = useState<Record<string, StopCoord[]>>({});
  const [now, setNow] = useState(() => Date.now());
  const tripsRef = useRef<TransportTrip[]>([]);

  const loadTrips = useCallback(async () => {
    const { data } = await db.from('transport_trips').select('*')
      .eq('status', 'active').is('deleted_at', null).order('started_at', { ascending: false });
    const rows = (data || []) as TransportTrip[];
    tripsRef.current = rows;
    setTrips(rows);
    return rows;
  }, []);

  /** One batched query for the recent ping samples of every active trip (no N+1). */
  const loadSamples = useCallback(async (rows: TransportTrip[]) => {
    const ids = rows.map(t => t.id);
    if (!ids.length) { setSamples({}); return; }
    const { data } = await db.from('location_pings')
      .select('trip_id,lat,lng,recorded_at')
      .in('trip_id', ids)
      .gte('recorded_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('recorded_at', { ascending: false })
      .limit(50 * ids.length);
    const grouped: Record<string, PingSample[]> = {};
    ((data || []) as (PingSample & { trip_id: string })[]).forEach(p => {
      const list = (grouped[p.trip_id] ||= []);
      if (list.length < 50) list.push({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at });
    });
    setSamples(grouped);
  }, []);

  const loadStops = useCallback(async (rows: TransportTrip[]) => {
    const routeIds = Array.from(new Set(rows.map(t => t.route_id)));
    if (!routeIds.length) { setStopsByRoute({}); return; }
    const { data } = await db.from('route_stops')
      .select('route_id,name,lat,lng,order_index,planned_to_school,planned_to_home')
      .in('route_id', routeIds)
      .is('deleted_at', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null);
    const grouped: Record<string, StopCoord[]> = {};
    ((data || []) as (StopCoord & { route_id: string })[]).forEach(s => {
      (grouped[s.route_id] ||= []).push({
        lat: s.lat, lng: s.lng, order_index: s.order_index, name: s.name,
        planned_to_school: s.planned_to_school ?? null, planned_to_home: s.planned_to_home ?? null,
      });
    });
    setStopsByRoute(grouped);
  }, []);

  const refreshAll = useCallback(async () => {
    const rows = await loadTrips();
    await Promise.all([loadSamples(rows), loadStops(rows)]);
    setNow(Date.now());
  }, [loadTrips, loadSamples, loadStops]);

  useEffect(() => {
    const init = async () => {
      const [{ data: r }, { data: v }] = await Promise.all([
        db.from('routes').select('*').is('deleted_at', null),
        db.from('vehicles').select('*').is('deleted_at', null),
      ]);
      setRoutes((r || []) as RouteType[]);
      setVehicles((v || []) as Vehicle[]);
      await refreshAll();
    };
    init();

    const channel = supabase
      .channel('transport-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_trips' }, () => refreshAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_pings' }, () => loadTrips())
      .subscribe();

    const timer = setInterval(() => { refreshAll(); }, 15000);
    return () => { supabase.removeChannel(channel); clearInterval(timer); };
  }, [refreshAll, loadTrips]);

  useEffect(() => {
    if (!selected) { setTrail([]); return; }
    const load = async () => {
      const { data } = await db.from('location_pings').select('lat,lng,recorded_at')
        .eq('trip_id', selected).order('recorded_at', { ascending: false }).limit(200);
      setTrail(((data || []) as Ping[]).slice().reverse());
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [selected, trips]);

  const routeName = (id: string) => routes.find(r => r.id === id)?.name ?? 'Hat';
  const vehicleLabel = (id: string | null) => {
    const v = vehicles.find(x => x.id === id);
    return v ? `${v.service_no} · ${v.plate}` : '-';
  };

  const alertsByTrip = useMemo(() => {
    const map: Record<string, SafetyAlert[]> = {};
    trips.forEach(t => {
      map[t.id] = computeTripAlerts({
        trip: {
          id: t.id,
          route_id: t.route_id,
          direction: t.direction,
          started_at: t.started_at,
          last_speed: t.last_speed,
          last_lat: t.last_lat,
          last_lng: t.last_lng,
          last_accuracy: t.last_accuracy,
          last_location_at: t.last_location_at,
        },
        pings: samples[t.id] ?? [],
        stops: stopsByRoute[t.route_id] ?? [],
        now,
      });
    });
    return map;
  }, [trips, samples, stopsByRoute, now]);

  const allAlerts = useMemo(() => Object.values(alertsByTrip).flat(), [alertsByTrip]);
  const summary = useMemo(() => summarizeAlerts(allAlerts), [allAlerts]);

  const located = trips.filter(t => t.last_lat != null && t.last_lng != null);
  const points = useMemo(() => located.map(t => [t.last_lat as number, t.last_lng as number] as [number, number]), [located]);
  const center: [number, number] = points[0] ?? [39.925, 32.866];

  const summaryTiles = [
    { key: 'ch', icon: AlertTriangle, label: 'Kritik / Yüksek', value: summary.criticalOrHigh },
    { key: 'gps', icon: MapPinOff, label: 'GPS kaybı', value: summary.gpsLost },
    { key: 'stop', icon: PauseCircle, label: 'Uzun durma', value: summary.longStop },
    { key: 'dev', icon: RouteIcon, label: 'Yaklaşık rota sapması', value: summary.routeDeviation },
    { key: 'delay', icon: Clock, label: 'Gecikme (tahmini)', value: summary.delayed },
  ];

  return (
    <AdminLayout>
      <PageHeader title="Canlı Takip" description="Aktif seferlerin anlık konumu ve operasyon uyarıları" />

      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Operasyon Uyarıları</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {summaryTiles.map(t => (
              <div key={t.key} className="rounded-md border p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <t.icon className="h-3.5 w-3.5" />
                  <span className="truncate">{t.label}</span>
                </div>
                <p className="mt-1 text-xl font-semibold">{t.value}</p>
              </div>
            ))}
          </div>

          {allAlerts.length > 0 ? (
            <ul className="space-y-2">
              {allAlerts.map((a, i) => (
                <li key={`${a.tripId}-${a.type}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(a.tripId)}
                    className="w-full rounded-md border p-2 text-left transition hover:bg-muted/60"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEVERITY_STYLE[a.severity]}>{SEVERITY_LABEL[a.severity]}</Badge>
                      <span className="text-sm font-medium">{routeName(a.tripId && trips.find(t => t.id === a.tripId)?.route_id || '')} · {a.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aktif uyarı yok.</p>
          )}

          <p className="text-[11px] leading-snug text-muted-foreground">
            Not: Rota sapması, durak koordinatlarından oluşturulan <strong>yaklaşık durak koridoruna</strong> göre
            hesaplanır; gerçek yol geometrisi kullanılmaz. Gecikme
            uyarısı yalnızca durakların yön bazlı planlı saatleri girilmişse, GPS konumu ve
            yaklaşık ETA üzerinden <strong>tahmin</strong> olarak üretilir.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3 order-2 lg:order-1 max-h-[70vh] overflow-y-auto">
          {trips.length === 0 && (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">Şu anda aktif sefer yok.</CardContent></Card>
          )}
          {trips.map(t => {
            const tripAlerts = alertsByTrip[t.id] ?? [];
            const worst = worstSeverity(tripAlerts);
            return (
              <Card key={t.id} className={`cursor-pointer transition ${selected === t.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelected(selected === t.id ? null : t.id)}>
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{routeName(t.route_id)}</p>
                    <Badge>{DIRECTION_LABELS[t.direction]}</Badge>
                  </div>
                  {tripAlerts.filter(a => a.type === 'DELAYED').map((a, i) => (
                    <p key={`d${i}`} className="text-xs font-medium text-orange-600">{a.detail}</p>
                  ))}
                  {worst && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Badge className={SEVERITY_STYLE[worst]}>{SEVERITY_LABEL[worst]}</Badge>
                      <span className="text-xs text-muted-foreground truncate">{tripAlerts[0].title}</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{vehicleLabel(t.vehicle_id)}</p>
                  <p className="text-xs">
                    Hız: {t.last_speed != null ? `${Math.max(0, t.last_speed * 3.6).toFixed(0)} km/s` : '-'} ·
                    {' '}Doğruluk: {t.last_accuracy != null ? `${t.last_accuracy.toFixed(0)} m` : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Son konum: {t.last_location_at ? new Date(t.last_location_at).toLocaleTimeString('tr-TR') : 'bekleniyor'}
                  </p>
                  {tripAlerts.length > 0 && (
                    <ul className="pt-1 space-y-0.5">
                      {tripAlerts.map((a, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground">• {a.detail}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="order-1 lg:order-2 h-[50vh] lg:h-[70vh] rounded-lg overflow-hidden border">
          <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap katkıda bulunanlar'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {located.map(t => {
              const tripAlerts = alertsByTrip[t.id] ?? [];
              const worst = worstSeverity(tripAlerts);
              return (
                <Marker key={t.id} position={[t.last_lat as number, t.last_lng as number]}
                  eventHandlers={{ click: () => setSelected(t.id) }}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-medium">{routeName(t.route_id)}</p>
                      <p>{vehicleLabel(t.vehicle_id)}</p>
                      <p>{t.last_speed != null ? `${Math.max(0, t.last_speed * 3.6).toFixed(0)} km/s` : 'hız yok'}</p>
                      {worst ? (
                        <p className="mt-1 font-medium">
                          {SEVERITY_LABEL[worst]}: {tripAlerts.map(a => a.title).join(', ')}
                        </p>
                      ) : (
                        <p className="mt-1 text-muted-foreground">Uyarı yok</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {trail.length > 1 && <Polyline positions={trail.map(p => [p.lat, p.lng] as [number, number])} />}
            <FitBounds points={points} />
          </MapContainer>
        </div>
      </div>
    </AdminLayout>
  );
}
