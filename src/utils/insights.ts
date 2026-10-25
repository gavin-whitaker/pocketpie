import type { Transaction } from '../types';
import { getMonthRange, prevMonth, formatMonthLabel } from './dates';

export interface CategoryStat {
  category: string;
  amount: number;
  share: number; // 0..1 of total expenses
}

export interface MonthOverMonth {
  category: string;
  thisMonth: number;
  lastMonth: number;
  delta: number;      // this - last
  pctChange: number | null; // null when last month was 0
}

export interface MonthStats {
  label: string;
  totalExpenses: number;
  totalIncome: number;
  topCategories: CategoryStat[];
  biggestExpenses: Transaction[];
  dailyAverage: number;
  projectedTotal: number;
  daysElapsed: number;
  daysInCycle: number;
}

export interface InsightsData {
  current: MonthStats;
  lastMonthTotal: number;
  totalDelta: number;
  totalPctChange: number | null;
  perCategory: MonthOverMonth[];
  trend: { label: string; total: number }[];
}

function sumExpenses(txs: Transaction[]): number {
  return txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
}

function sumIncome(txs: Transaction[]): number {
  return txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
}

function categoryTotals(txs: Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txs.filter(t => t.type === 'expense')) {
    if (t.category === 'Income') continue;
    m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
  }
  return m;
}

/** Inclusive day count between two ISO dates. */
function daysBetween(startISO: string, endISO: string): number {
  const s = new Date(startISO + 'T00:00:00');
  const e = new Date(endISO + 'T00:00:00');
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

/** How many days of the cycle have elapsed as of today (clamped to the cycle). */
function daysElapsedInCycle(startISO: string, endISO: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = new Date(startISO + 'T00:00:00');
  const e = new Date(endISO + 'T00:00:00');
  if (today < s) return 0;
  if (today > e) return daysBetween(startISO, endISO);
  return Math.round((today.getTime() - s.getTime()) / 86400000) + 1;
}

export function computeMonthStats(
  txs: Transaction[],
  year: number,
  month: number
): MonthStats {
  const expenses = txs.filter(t => t.type === 'expense');
  const totalExpenses = sumExpenses(txs);
  const totalIncome = sumIncome(txs);

  const totals = categoryTotals(txs);
  const topCategories: CategoryStat[] = [...totals.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      share: totalExpenses > 0 ? amount / totalExpenses : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const biggestExpenses = [...expenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    label: formatMonthLabel(year, month),
    totalExpenses,
    totalIncome,
    topCategories,
    biggestExpenses,
    dailyAverage: 0,
    projectedTotal: 0,
    daysElapsed: 0,
    daysInCycle: 0,
  };
}

/**
 * Builds the full insights payload. `getTxs` fetches transactions for a given
 * budget month; it is injected so this stays pure/testable and free of DB imports.
 */
export async function buildInsights(
  year: number,
  month: number,
  monthStartDay: number,
  getTxs: (startDate: string, endDate: string) => Promise<Transaction[]>
): Promise<InsightsData> {
  const curRange = getMonthRange(year, month, monthStartDay);
  const curTxs = await getTxs(curRange.startDate, curRange.endDate);

  const prev = prevMonth(year, month);
  const prevRange = getMonthRange(prev.year, prev.month, monthStartDay);
  const prevTxs = await getTxs(prevRange.startDate, prevRange.endDate);

  const current = computeMonthStats(curTxs, year, month);

  const daysInCycle = daysBetween(curRange.startDate, curRange.endDate);
  const daysElapsed = Math.max(1, daysElapsedInCycle(curRange.startDate, curRange.endDate));
  current.daysInCycle = daysInCycle;
  current.daysElapsed = daysElapsed;
  current.dailyAverage = current.totalExpenses / daysElapsed;
  current.projectedTotal = current.dailyAverage * daysInCycle;

  const lastMonthTotal = sumExpenses(prevTxs);
  const totalDelta = current.totalExpenses - lastMonthTotal;
  const totalPctChange = lastMonthTotal > 0 ? (totalDelta / lastMonthTotal) * 100 : null;

  // Per-category month-over-month
  const curTotals = categoryTotals(curTxs);
  const prevTotals = categoryTotals(prevTxs);
  const allCats = new Set([...curTotals.keys(), ...prevTotals.keys()]);
  const perCategory: MonthOverMonth[] = [...allCats].map(category => {
    const thisMonth = curTotals.get(category) ?? 0;
    const lastMonth = prevTotals.get(category) ?? 0;
    const delta = thisMonth - lastMonth;
    return {
      category,
      thisMonth,
      lastMonth,
      delta,
      pctChange: lastMonth > 0 ? (delta / lastMonth) * 100 : null,
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // 6-month trend (oldest → newest)
  const trend: { label: string; total: number }[] = [];
  let ty = year, tm = month;
  const points: { year: number; month: number }[] = [];
  for (let i = 0; i < 6; i++) {
    points.unshift({ year: ty, month: tm });
    const p = prevMonth(ty, tm);
    ty = p.year; tm = p.month;
  }
  for (const pt of points) {
    const r = getMonthRange(pt.year, pt.month, monthStartDay);
    const txs = await getTxs(r.startDate, r.endDate);
    trend.push({
      label: new Date(pt.year, pt.month - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
      total: sumExpenses(txs),
    });
  }

  return { current, lastMonthTotal, totalDelta, totalPctChange, perCategory, trend };
}
