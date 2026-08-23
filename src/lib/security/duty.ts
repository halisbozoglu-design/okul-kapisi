/**
 * Nöbetçi öğrenci üretim motoru (saf fonksiyonlar — DB erişimi yok).
 * Adalet önceliği: en az nöbet sayısı > en eski son nöbet tarihi > deterministik sıra.
 */

export type GenderRule = 'any' | 'male' | 'female';

export interface DutyStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_no?: string | null;
  section_id?: string | null;
  /** students tablosunda cinsiyet alanı yoksa undefined kalır. */
  gender?: 'male' | 'female' | null;
}

export interface DutyLocation {
  id: string;
  name: string;
  capacity: number;
  gender_rule: GenderRule;
}

export interface DutyAssignmentLike {
  duty_date: string; // YYYY-MM-DD
  location_id: string;
  student_id: string;
}

export interface CalendarDay {
  date: string;
  is_school_day: boolean;
}

export interface GenerateInput {
  students: DutyStudent[];
  locations: DutyLocation[];
  /** Üretilecek tarihler (YYYY-MM-DD). */
  dates: string[];
  /** Mevcut (elle veya önceden üretilmiş) atamalar — asla silinmez. */
  existing: DutyAssignmentLike[];
  exemptStudentIds?: string[];
  /** Takvim istisnaları; is_school_day=false günler atlanır. */
  calendar?: CalendarDay[];
  /** Geçmiş dönemden gelen nöbet sayıları (adalet devamlılığı). */
  priorCounts?: Record<string, number>;
  /** Öğrenci -> son nöbet tarihi (YYYY-MM-DD). */
  priorLastDuty?: Record<string, string>;
}

export interface GenerateResult {
  created: DutyAssignmentLike[];
  counts: Record<string, number>;
  skippedDates: string[];
  lastGeneratedDate: string | null;
}

/** Deterministik tie-break anahtarı. */
function orderKey(s: DutyStudent): string {
  return [s.section_id ?? '', s.student_no ?? '', `${s.last_name} ${s.first_name}`, s.id].join('|');
}

export function isSchoolDay(date: string, calendar?: CalendarDay[]): boolean {
  const entry = calendar?.find((c) => c.date === date);
  if (entry) return entry.is_school_day;
  const day = new Date(`${date}T00:00:00`).getDay();
  return day !== 0 && day !== 6;
}

function genderAllowed(student: DutyStudent, rule: GenderRule): boolean {
  if (rule === 'any') return true;
  // Cinsiyet verisi yoksa kural uygulanamaz; öğrenciyi eleme (UI'da uyarı gösterilir).
  if (student.gender === undefined || student.gender === null) return true;
  return student.gender === rule;
}

export function generateDutyPlan(input: GenerateInput): GenerateResult {
  const {
    students, locations, dates, existing,
    exemptStudentIds = [], calendar, priorCounts = {}, priorLastDuty = {},
  } = input;

  const exempt = new Set(exemptStudentIds);
  const pool = students.filter((s) => !exempt.has(s.id));

  const counts: Record<string, number> = {};
  const lastDuty: Record<string, string> = { ...priorLastDuty };
  pool.forEach((s) => { counts[s.id] = priorCounts[s.id] ?? 0; });

  const existingByDateLoc = new Map<string, DutyAssignmentLike[]>();
  const assignedByDate = new Map<string, Set<string>>();
  for (const a of existing) {
    const key = `${a.duty_date}|${a.location_id}`;
    if (!existingByDateLoc.has(key)) existingByDateLoc.set(key, []);
    existingByDateLoc.get(key)!.push(a);
    if (!assignedByDate.has(a.duty_date)) assignedByDate.set(a.duty_date, new Set());
    assignedByDate.get(a.duty_date)!.add(a.student_id);
    if (a.student_id in counts) counts[a.student_id] += 1;
    if (!lastDuty[a.student_id] || lastDuty[a.student_id] < a.duty_date) lastDuty[a.student_id] = a.duty_date;
  }

  const created: DutyAssignmentLike[] = [];
  const skippedDates: string[] = [];
  let lastGeneratedDate: string | null = null;

  const sortedDates = [...dates].sort();
  for (const date of sortedDates) {
    if (!isSchoolDay(date, calendar)) {
      skippedDates.push(date);
      continue;
    }
    lastGeneratedDate = date;
    const dayAssigned = assignedByDate.get(date) ?? new Set<string>();
    assignedByDate.set(date, dayAssigned);

    for (const loc of locations) {
      const key = `${date}|${loc.id}`;
      const already = existingByDateLoc.get(key)?.length ?? 0;
      const need = Math.max(0, (loc.capacity || 1) - already);
      for (let i = 0; i < need; i++) {
        const candidates = pool
          .filter((s) => !dayAssigned.has(s.id) && genderAllowed(s, loc.gender_rule))
          .sort((a, b) => {
            const ca = counts[a.id] ?? 0;
            const cb = counts[b.id] ?? 0;
            if (ca !== cb) return ca - cb;
            const la = lastDuty[a.id] ?? '';
            const lb = lastDuty[b.id] ?? '';
            if (la !== lb) return la < lb ? -1 : 1;
            return orderKey(a) < orderKey(b) ? -1 : 1;
          });
        const pick = candidates[0];
        if (!pick) break;
        created.push({ duty_date: date, location_id: loc.id, student_id: pick.id });
        dayAssigned.add(pick.id);
        counts[pick.id] = (counts[pick.id] ?? 0) + 1;
        lastDuty[pick.id] = date;
      }
    }
  }

  return { created, counts, skippedDates, lastGeneratedDate };
}

/** İki tarih arası (dahil) YYYY-MM-DD listesi üretir. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Devamsızlık entegrasyonu için ileriye dönük arayüz (şimdilik veri kaynağı yok). */
export interface AttendanceAdapter {
  isStudentAbsent(studentId: string, date: string): Promise<boolean>;
}
