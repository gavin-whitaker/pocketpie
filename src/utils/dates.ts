/**
 * Returns the start and end date strings for the "budget month" that contains
 * the given anchor date, given a custom monthStartDay.
 *
 * Example: monthStartDay=15, anchor=2026-07-20 → start=2026-07-15, end=2026-08-14
 */
export function getMonthRange(
  year: number,
  month: number,   // 1-based (July = 7)
  monthStartDay: number
): { startDate: string; endDate: string } {
  const start = new Date(year, month - 1, monthStartDay);
  const end = new Date(year, month, monthStartDay - 1);
  return {
    startDate: toISODate(start),
    endDate: toISODate(end),
  };
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function formatMonthLabel(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Returns { year, month } for one month forward */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/** Returns { year, month } for one month back */
export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/** Current year and month (1-based) */
export function currentYearMonth(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
