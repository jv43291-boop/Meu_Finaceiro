/** Mês no formato "YYYY-MM". Data no formato "YYYY-MM-DD" (sempre data local, sem fuso). */
export type MonthKey = string;
export type DateISO = string;

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateISO(d: Date): DateISO {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): DateISO {
  return toDateISO(now);
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return todayISO(now).slice(0, 7);
}

export function monthOf(date: DateISO): MonthKey {
  return date.slice(0, 7);
}

export function parseMonth(m: MonthKey): { year: number; month: number } {
  const [y, mm] = m.split('-').map(Number);
  return { year: y, month: mm };
}

export function shiftMonth(m: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonth(m);
  const total = year * 12 + (month - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Quantos meses de a até b (b - a). */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const pa = parseMonth(a);
  const pb = parseMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

export function daysInMonth(m: MonthKey): number {
  const { year, month } = parseMonth(m);
  return new Date(year, month, 0).getDate();
}

/** Dia do mês ajustado ao tamanho do mês (dia 31 em fevereiro vira 28/29). */
export function dateForDay(m: MonthKey, day: number): DateISO {
  const d = Math.min(Math.max(1, Math.round(day)), daysInMonth(m));
  return `${m}-${pad(d)}`;
}

export function dayOf(date: DateISO): number {
  return Number(date.slice(8, 10));
}

export function monthLabel(m: MonthKey, withYear = true): string {
  const { year, month } = parseMonth(m);
  return withYear ? `${MONTHS[month - 1]} ${year}` : MONTHS[month - 1];
}

export function shortMonthLabel(m: MonthKey): string {
  const { year, month } = parseMonth(m);
  return `${MONTHS[month - 1].slice(0, 3).toLowerCase()}/${String(year).slice(2)}`;
}

/** "25/09/2026" */
export function formatDateBR(date: DateISO): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** "qui, 25 de setembro" */
export function formatDateLong(date: DateISO): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${wd}, ${d} de ${MONTHS[m - 1].toLowerCase()}`;
}

/** Aceita "25/09/2026", "25/9/26", "25/09" (usa o ano de referência). */
export function parseDateBR(input: string, refYear: number): DateISO | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : refYear;
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1) return null;
  const key = `${y}-${pad(mo)}`;
  if (d > daysInMonth(key)) return null;
  return `${key}-${pad(d)}`;
}

export function addDays(date: DateISO, days: number): DateISO {
  const [y, m, d] = date.split('-').map(Number);
  return toDateISO(new Date(y, m - 1, d + days));
}
