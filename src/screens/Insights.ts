import Chart from 'chart.js/auto';
import { getTransactionsByDateRange, getCategories, getAllSettings } from '../db';
import { buildInsights } from '../utils/insights';
import type { InsightsData } from '../utils/insights';
import { formatMonthLabel, nextMonth, prevMonth, currentYearMonth } from '../utils/dates';
import { icon } from '../utils/icons';

interface InsightsState {
  year: number;
  month: number;
  chart: Chart | null;
}

const state: InsightsState = { ...currentYearMonth(), chart: null };

export async function renderInsights(container: HTMLElement): Promise<void> {
  if (state.chart) { state.chart.destroy(); state.chart = null; }

  const [settings, categories] = await Promise.all([getAllSettings(), getCategories()]);
  const sym = settings.currencySymbol ?? '$';
  const catColors = new Map(categories.map(c => [c.name, c.color]));

  const data = await buildInsights(
    state.year, state.month, settings.monthStartDay ?? 1,
    (s, e) => getTransactionsByDateRange(s, e)
  );

  renderHTML(container, data, sym, catColors);
  buildTrendChart(data, sym);
  bindEvents(container);
}

function deltaBadge(pct: number | null, delta: number): string {
  if (delta === 0 || (pct === null && delta === 0)) return `<span class="delta flat">no change</span>`;
  const up = delta > 0;
  const arrow = up ? '↑' : '↓';
  const cls = up ? 'delta up' : 'delta down';
  const pctStr = pct === null ? 'new' : `${Math.abs(pct).toFixed(0)}%`;
  return `<span class="${cls}">${arrow} ${pctStr}</span>`;
}

function renderHTML(
  container: HTMLElement,
  data: InsightsData,
  sym: string,
  catColors: Map<string, string>
): void {
  const c = data.current;

  const topCatsHTML = c.topCategories.length === 0
    ? `<p class="section-note">No spending this month.</p>`
    : c.topCategories.slice(0, 6).map(stat => `
        <div class="insight-cat-row">
          <span class="legend-dot" style="background:${catColors.get(stat.category) ?? '#94a3b8'}"></span>
          <span class="legend-name">${stat.category}</span>
          <span class="legend-pct">${(stat.share * 100).toFixed(0)}%</span>
          <span class="legend-amt">${sym}${stat.amount.toFixed(2)}</span>
        </div>`).join('');

  const biggestHTML = c.biggestExpenses.length === 0
    ? `<p class="section-note">No expenses yet.</p>`
    : c.biggestExpenses.map(t => `
        <div class="insight-cat-row">
          <span class="legend-dot" style="background:${catColors.get(t.category) ?? '#94a3b8'}"></span>
          <span class="legend-name">${t.note || t.category}</span>
          <span class="legend-amt expense">${sym}${t.amount.toFixed(2)}</span>
        </div>`).join('');

  const movers = data.perCategory.filter(m => m.delta !== 0).slice(0, 5);
  const moversHTML = movers.length === 0
    ? `<p class="section-note">Not enough history yet.</p>`
    : movers.map(m => `
        <div class="insight-cat-row">
          <span class="legend-dot" style="background:${catColors.get(m.category) ?? '#94a3b8'}"></span>
          <span class="legend-name">${m.category}</span>
          ${deltaBadge(m.pctChange, m.delta)}
          <span class="legend-amt">${sym}${m.thisMonth.toFixed(2)}</span>
        </div>`).join('');

  container.innerHTML = `
    <div class="insights-screen">
      <div class="screen-header"><h2>Insights</h2></div>

      <div class="month-nav">
        <button class="nav-btn" id="ins-prev">&#8249;</button>
        <span class="month-label">${formatMonthLabel(state.year, state.month)}</span>
        <button class="nav-btn" id="ins-next">&#8250;</button>
      </div>

      <div class="insight-headline">
        <div class="ih-total">${sym}${c.totalExpenses.toFixed(2)}</div>
        <div class="ih-sub">
          spent this month ${deltaBadge(data.totalPctChange, data.totalDelta)}
          <span class="ih-vs">vs ${sym}${data.lastMonthTotal.toFixed(2)} last month</span>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-box">
          <span class="stat-label">Daily average</span>
          <span class="stat-value">${sym}${c.dailyAverage.toFixed(2)}</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Projected total</span>
          <span class="stat-value">${sym}${c.projectedTotal.toFixed(2)}</span>
        </div>
      </div>

      <div class="settings-section">
        <div class="section-header"><span class="section-icon">${icon('chart', { size: 18 })}</span><h3>6-month trend</h3></div>
        <div class="trend-wrapper"><canvas id="trend-chart"></canvas></div>
      </div>

      <div class="settings-section">
        <div class="section-header"><span class="section-icon">${icon('trophy', { size: 18 })}</span><h3>Top categories</h3></div>
        ${topCatsHTML}
      </div>

      <div class="settings-section">
        <div class="section-header"><span class="section-icon">${icon('banknote', { size: 18 })}</span><h3>Biggest expenses</h3></div>
        ${biggestHTML}
      </div>

      <div class="settings-section">
        <div class="section-header"><span class="section-icon">${icon('swap', { size: 18 })}</span><h3>Month-over-month movers</h3></div>
        ${moversHTML}
      </div>
    </div>`;
}

function buildTrendChart(data: InsightsData, sym: string): void {
  const canvas = document.getElementById('trend-chart') as HTMLCanvasElement | null;
  if (!canvas) return;
  if (state.chart) { state.chart.destroy(); state.chart = null; }

  state.chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.trend.map(t => t.label),
      datasets: [{
        data: data.trend.map(t => t.total),
        backgroundColor: '#7c6ff7',
        borderRadius: 6,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ` ${sym}${(ctx.raw as number).toFixed(2)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8080a0' } },
        y: {
          grid: { color: 'rgba(128,128,160,0.15)' },
          ticks: { color: '#8080a0', callback: (v) => `${sym}${v}` },
        },
      },
    },
  });
}

function bindEvents(container: HTMLElement): void {
  container.querySelector('#ins-prev')?.addEventListener('click', () => {
    const p = prevMonth(state.year, state.month); state.year = p.year; state.month = p.month;
    renderInsights(container);
  });
  container.querySelector('#ins-next')?.addEventListener('click', () => {
    const n = nextMonth(state.year, state.month); state.year = n.year; state.month = n.month;
    renderInsights(container);
  });
}
