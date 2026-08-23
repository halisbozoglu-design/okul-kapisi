import { TransportDirection, TransportEventType, TripStatus } from '@/types/transport';

export type StudentTransportStatus =
  | 'no_trip'
  | 'waiting'
  | 'boarded'
  | 'onboard'
  | 'no_show'
  | 'dropped_off'
  | 'trip_completed';

export interface StudentEventLike {
  student_id?: string | null;
  event_type: TransportEventType;
  occurred_at: string;
}

export interface DerivedStudentStatus {
  status: StudentTransportStatus;
  label: string;
  /** ISO timestamp of the last attendance event, if any */
  lastEventAt: string | null;
  lastEventType: TransportEventType | null;
  tone: 'neutral' | 'positive' | 'warning' | 'danger';
}

const ATTENDANCE_EVENTS: TransportEventType[] = ['BOARDING', 'NO_SHOW', 'DISEMBARK'];

const LABELS: Record<StudentTransportStatus, string> = {
  no_trip: 'Sefer yok',
  waiting: 'Servis bekliyor',
  boarded: 'Bindi',
  onboard: 'Araçta',
  no_show: 'Binmedi',
  dropped_off: 'İndi',
  trip_completed: 'Sefer tamamlandı',
};

const TONES: Record<StudentTransportStatus, DerivedStudentStatus['tone']> = {
  no_trip: 'neutral',
  waiting: 'neutral',
  boarded: 'positive',
  onboard: 'positive',
  no_show: 'danger',
  dropped_off: 'positive',
  trip_completed: 'neutral',
};

/**
 * Deterministically derives a student's transport status from `transport_events`.
 * No separate attendance table is used — events are the single source of truth.
 * Reusable by parent, admin and driver screens.
 */
export function deriveStudentStatus(params: {
  events: StudentEventLike[];
  tripStatus?: TripStatus | null;
  direction?: TransportDirection | null;
}): DerivedStudentStatus {
  const { events, tripStatus, direction } = params;

  const attendance = events
    .filter(e => ATTENDANCE_EVENTS.includes(e.event_type))
    .slice()
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const last = attendance[attendance.length - 1] ?? null;

  if (!tripStatus || tripStatus === 'cancelled') {
    return build(last ? mapEvent(last.event_type, direction, false) : 'no_trip', last);
  }

  if (!last) {
    if (tripStatus === 'completed') return build('trip_completed', null);
    if (tripStatus === 'active') return build('waiting', null);
    return build('waiting', null);
  }

  if (tripStatus === 'completed' && last.event_type === 'BOARDING') {
    // Trip ended while still marked onboard -> treat as completed journey.
    return build('trip_completed', last);
  }

  return build(mapEvent(last.event_type, direction, tripStatus === 'active'), last);
}

function mapEvent(
  type: TransportEventType,
  direction: TransportDirection | null | undefined,
  tripActive: boolean,
): StudentTransportStatus {
  switch (type) {
    case 'BOARDING':
      return tripActive ? 'onboard' : 'boarded';
    case 'NO_SHOW':
      return 'no_show';
    case 'DISEMBARK':
      return direction === 'to_school' || direction === 'to_home' ? 'dropped_off' : 'dropped_off';
    default:
      return 'waiting';
  }
}

function build(status: StudentTransportStatus, last: StudentEventLike | null): DerivedStudentStatus {
  return {
    status,
    label: LABELS[status],
    lastEventAt: last?.occurred_at ?? null,
    lastEventType: last?.event_type ?? null,
    tone: TONES[status],
  };
}

export function statusLabel(status: StudentTransportStatus) {
  return LABELS[status];
}

/** Groups events per student id, keeping chronological order. */
export function groupEventsByStudent<T extends StudentEventLike>(events: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  events
    .slice()
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .forEach(e => {
      if (!e.student_id) return;
      (map[e.student_id] ||= []).push(e);
    });
  return map;
}
