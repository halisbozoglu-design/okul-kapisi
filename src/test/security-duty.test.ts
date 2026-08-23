import { describe, expect, it } from 'vitest';
import { dateRange, DutyLocation, DutyStudent, generateDutyPlan, isSchoolDay } from '@/lib/security/duty';

function makeStudents(n: number, gender?: 'male' | 'female'): DutyStudent[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${String(i + 1).padStart(2, '0')}`,
    first_name: `Ad${i + 1}`,
    last_name: 'Soyad',
    student_no: String(100 + i),
    section_id: 'sec1',
    gender: gender ?? (i % 2 === 0 ? 'male' : 'female'),
  }));
}

const loc = (id: string, capacity = 1, gender_rule: DutyLocation['gender_rule'] = 'any'): DutyLocation =>
  ({ id, name: id, capacity, gender_rule });

// 2026-08-24 pazartesi ile başlayan 10 okul günü
const SCHOOL_DAYS = [
  '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
  '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
];

describe('nöbet adaleti', () => {
  it('20 öğrenci, 2 yer, 10 gün: nöbet sayısı farkı en fazla 1', () => {
    const students = makeStudents(20);
    const res = generateDutyPlan({
      students,
      locations: [loc('A'), loc('B')],
      dates: SCHOOL_DAYS,
      existing: [],
    });
    expect(res.created).toHaveLength(20);
    const counts = students.map((s) => res.created.filter((c) => c.student_id === s.id).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('tatil günleri atlanır', () => {
    const res = generateDutyPlan({
      students: makeStudents(5),
      locations: [loc('A')],
      dates: ['2026-08-24', '2026-08-25'],
      existing: [],
      calendar: [{ date: '2026-08-25', is_school_day: false }],
    });
    expect(res.skippedDates).toEqual(['2026-08-25']);
    expect(res.created.every((c) => c.duty_date === '2026-08-24')).toBe(true);
  });

  it('hafta sonu varsayılan olarak okul günü değildir', () => {
    expect(isSchoolDay('2026-08-29')).toBe(false); // cumartesi
    expect(isSchoolDay('2026-08-24')).toBe(true);
  });

  it('muaf öğrenci hiçbir zaman atanmaz', () => {
    const res = generateDutyPlan({
      students: makeStudents(6),
      locations: [loc('A')],
      dates: SCHOOL_DAYS,
      existing: [],
      exemptStudentIds: ['s01'],
    });
    expect(res.created.some((c) => c.student_id === 's01')).toBe(false);
  });

  it('cinsiyet kuralı, veri varsa uygulanır', () => {
    const students = makeStudents(10);
    const res = generateDutyPlan({
      students,
      locations: [loc('KIZ', 1, 'female')],
      dates: SCHOOL_DAYS,
      existing: [],
    });
    const genders = res.created.map((c) => students.find((s) => s.id === c.student_id)?.gender);
    expect(genders.every((g) => g === 'female')).toBe(true);
  });

  it('cinsiyet verisi yoksa öğrenci elenmez', () => {
    const students = makeStudents(4).map((s) => ({ ...s, gender: undefined }));
    const res = generateDutyPlan({ students, locations: [loc('KIZ', 1, 'female')], dates: ['2026-08-24'], existing: [] });
    expect(res.created).toHaveLength(1);
  });

  it('aynı öğrenci aynı gün iki yere atanmaz', () => {
    const res = generateDutyPlan({
      students: makeStudents(4),
      locations: [loc('A'), loc('B')],
      dates: SCHOOL_DAYS,
      existing: [],
    });
    for (const d of SCHOOL_DAYS) {
      const ids = res.created.filter((c) => c.duty_date === d).map((c) => c.student_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('mevcut atamalar korunur, yalnız boş ihtiyaçlar doldurulur', () => {
    const existing = [{ duty_date: '2026-08-24', location_id: 'A', student_id: 's03' }];
    const res = generateDutyPlan({
      students: makeStudents(6),
      locations: [loc('A'), loc('B')],
      dates: ['2026-08-24'],
      existing,
    });
    expect(res.created).toHaveLength(1);
    expect(res.created[0].location_id).toBe('B');
    expect(res.created[0].student_id).not.toBe('s03');
  });

  it('kaldığı yerden devam: geçmiş sayımlar dikkate alınır', () => {
    const res = generateDutyPlan({
      students: makeStudents(3),
      locations: [loc('A')],
      dates: ['2026-08-24'],
      existing: [],
      priorCounts: { s01: 5, s02: 5, s03: 0 },
    });
    expect(res.created[0].student_id).toBe('s03');
    expect(res.lastGeneratedDate).toBe('2026-08-24');
  });

  it('deterministik: aynı girdi aynı çıktı', () => {
    const input = { students: makeStudents(7), locations: [loc('A'), loc('B')], dates: SCHOOL_DAYS, existing: [] };
    expect(generateDutyPlan(input).created).toEqual(generateDutyPlan(input).created);
  });

  it('dateRange kapsayıcı liste üretir', () => {
    expect(dateRange('2026-08-24', '2026-08-26')).toEqual(['2026-08-24', '2026-08-25', '2026-08-26']);
  });
});
