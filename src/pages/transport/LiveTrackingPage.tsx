import { useEffect, useMemo, useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { Route as RouteType, TransportTrip, Vehicle, DIRECTION_LABELS } from '@/types/transport';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface Ping { lat: number; lng: number; recorded_at: string }

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

  const loadTrips = async () => {
    const { data } = await db.from('transport_trips').select('*')
      .eq('status', 'active').is('deleted_at', null).order('started_at', { ascending: false });
    setTrips((data || []) as TransportTrip[]);
  };

  useEffect(() => {
    const init = async () => {
      const [{ data: r }, { data: v }] = await Promise.all([
        db.from('routes').select('*').is('deleted_at', null),
        db.from('vehicles').select('*').is('deleted_at', null),
      ]);
      setRoutes((r || []) as RouteType[]);
      setVehicles((v || []) as Vehicle[]);
      await loadTrips();
    };
    init();

    const channel = supabase
      .channel('transport-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_trips' }, () => loadTrips())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_pings' }, () => loadTrips())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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

  const located = trips.filter(t => t.last_lat != null && t.last_lng != null);
  const points = useMemo(() => located.map(t => [t.last_lat as number, t.last_lng as number] as [number, number]), [located]);
  const center: [number, number] = points[0] ?? [39.925, 32.866];

  return (
    <AdminLayout>
      <PageHeader title="Canlı Takip" description="Aktif seferlerin anlık konumu" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3 order-2 lg:order-1 max-h-[70vh] overflow-y-auto">
          {trips.length === 0 && (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">Şu anda aktif sefer yok.</CardContent></Card>
          )}
          {trips.map(t => (
            <Card key={t.id} className={`cursor-pointer transition ${selected === t.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelected(selected === t.id ? null : t.id)}>
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{routeName(t.route_id)}</p>
                  <Badge>{DIRECTION_LABELS[t.direction]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{vehicleLabel(t.vehicle_id)}</p>
                <p className="text-xs">
                  Hız: {t.last_speed != null ? `${Math.max(0, t.last_speed * 3.6).toFixed(0)} km/s` : '-'} ·
                  {' '}Doğruluk: {t.last_accuracy != null ? `${t.last_accuracy.toFixed(0)} m` : '-'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Son konum: {t.last_location_at ? new Date(t.last_location_at).toLocaleTimeString('tr-TR') : 'bekleniyor'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="order-1 lg:order-2 h-[50vh] lg:h-[70vh] rounded-lg overflow-hidden border">
          <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap katkıda bulunanlar'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {located.map(t => (
              <Marker key={t.id} position={[t.last_lat as number, t.last_lng as number]}
                eventHandlers={{ click: () => setSelected(t.id) }}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-medium">{routeName(t.route_id)}</p>
                    <p>{vehicleLabel(t.vehicle_id)}</p>
                    <p>{t.last_speed != null ? `${Math.max(0, t.last_speed * 3.6).toFixed(0)} km/s` : 'hız yok'}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
            {trail.length > 1 && <Polyline positions={trail.map(p => [p.lat, p.lng] as [number, number])} />}
            <FitBounds points={points} />
          </MapContainer>
        </div>
      </div>
    </AdminLayout>
  );
}
