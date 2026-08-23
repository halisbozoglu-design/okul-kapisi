export type TransportStaffRole = 'driver' | 'attendant';
export type TransportDirection = 'to_school' | 'to_home' | 'both';
export type TripStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type TransportEventType =
  | 'START_TRIP'
  | 'LOCATION'
  | 'BOARDING'
  | 'NO_SHOW'
  | 'DISEMBARK'
  | 'VEHICLE_CHECK'
  | 'END_TRIP';

export const DIRECTION_LABELS: Record<TransportDirection, string> = {
  to_school: 'Okula Gidiş',
  to_home: 'Eve Dönüş',
  both: 'Gidiş / Dönüş',
};

export const STAFF_ROLE_LABELS: Record<TransportStaffRole, string> = {
  driver: 'Şoför',
  attendant: 'Rehber Personel',
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  planned: 'Planlandı',
  active: 'Aktif',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

export const EVENT_LABELS: Record<TransportEventType, string> = {
  START_TRIP: 'Sefer Başladı',
  LOCATION: 'Konum',
  BOARDING: 'Bindi',
  NO_SHOW: 'Binmedi',
  DISEMBARK: 'İndi',
  VEHICLE_CHECK: 'Araç Son Kontrol',
  END_TRIP: 'Sefer Bitti',
};

export interface Vehicle {
  id: string;
  institution_id: string;
  service_no: string;
  plate: string;
  brand: string | null;
  model: string | null;
  model_year: number | null;
  capacity: number | null;
  description: string | null;
  is_demo: boolean;
  is_active: boolean;
}

export interface TransportStaff {
  id: string;
  institution_id: string;
  user_id: string | null;
  staff_role: TransportStaffRole;
  full_name: string;
  phone: string | null;
  license_no: string | null;
  notes: string | null;
  is_demo: boolean;
  is_active: boolean;
}

export interface Route {
  id: string;
  institution_id: string;
  campus_id: string | null;
  vehicle_id: string | null;
  driver_staff_id: string | null;
  attendant_staff_id: string | null;
  name: string;
  code: string | null;
  direction: TransportDirection;
  description: string | null;
  is_demo: boolean;
  is_active: boolean;
}

export interface RouteStop {
  id: string;
  institution_id: string;
  route_id: string;
  name: string;
  order_index: number;
  lat: number | null;
  lng: number | null;
  planned_time: string | null;
  is_active: boolean;
}

export interface Student {
  id: string;
  institution_id: string;
  student_no: string | null;
  first_name: string;
  last_name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  is_demo: boolean;
  is_active: boolean;
}

export interface StudentAssignment {
  id: string;
  institution_id: string;
  student_id: string;
  route_id: string;
  stop_id: string | null;
  direction: TransportDirection;
  is_active: boolean;
}

export interface TransportTrip {
  id: string;
  institution_id: string;
  route_id: string;
  vehicle_id: string | null;
  driver_staff_id: string | null;
  attendant_staff_id: string | null;
  direction: TransportDirection;
  status: TripStatus;
  started_at: string;
  ended_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_speed: number | null;
  last_heading: number | null;
  last_location_at: string | null;
}

export interface TransportEvent {
  id: string;
  trip_id: string;
  student_id: string | null;
  event_type: TransportEventType;
  actor_user_id: string | null;
  lat: number | null;
  lng: number | null;
  occurred_at: string;
}
