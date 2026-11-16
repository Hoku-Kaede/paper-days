/* Calendar + date helpers. All math is local-time-safe: parse "YYYY-MM-DD"
   into a plain Y/M/D tuple and build Dates from those parts directly. */

export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const WEEKDAYS_LETTERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const WEEKDAYS_FULL_MON_FIRST = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

function dateOf(iso: string): Date {
  const { y, m, d } = parts(iso);
  return new Date(y, m - 1, d);
}

function isoOfDate(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function todayISO(): string {
  return isoOfDate(new Date());
}

/** "Tuesday, 10 November 2026" — the way a diary date is written. */
export function longDate(iso: string): string {
  const date = dateOf(iso);
  return `${WEEKDAYS_FULL_MON_FIRST[(date.getDay() + 6) % 7]} `
    + `${parts(iso).d} ${MONTHS_LONG[parts(iso).m - 1]} ${parts(iso).y}`;
}

/** "10 Nov" — for the recently-written list. */
export function shortDate(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** Month key from a date ISO, "YYYY-MM". */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Adjacent calendar day, +1/-1 — for flipping the sheets page by page. */
export function shiftDay(iso: string, delta: number): string {
  const { y, m, d } = parts(iso);
  const date = new Date(y, m - 1, d + delta);
  return isoOfDate(date);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function dayNumber(iso: string): number {
  return parts(iso).d;
}

/** Monday-first calendar grid for a month, whole weeks, blanks as null. */
export function monthGrid(key: string): Array<Array<string | null>> {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
