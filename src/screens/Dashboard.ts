import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import type { Category, Transaction, Settings, Goal, Bill } from '../types';
import {
  getTransactionsByDateRange, getCategories, getAllSettings, getGoals, getBills,
  TITHE_CATEGORY_NAME, INCOME_CATEGORY_NAME,
} from '../db';
import {
  getMonthRange, formatMonthLabel, nextMonth, prevMonth, currentYearMonth
} from '../utils/dates';
import { dueSoon } from './Bills';
import { setPendingPrefill } from './AddTransaction';
import { openCategory } from './CategoryDetail';
import { navigate } from '../nav';
import { icon } from '../utils/icons';
import type { Tab } from '../types';

Chart.register(ChartDataLabels);

interface State {
  year: number;
  month: number;
  transactions: Transaction[];
  categories: Category[];
  settings: Settings;
  goals: Goal[];
  bills: Bill[];
  lastMonthExpenses: number;
  chart: Chart | null;
}

const state: State = {
  ...currentYearMonth(),
  transactions: [],
  categories: [],
  settings: {} as Settings,
  goals: [],
  bills: [],
  lastMonthExpenses: 0,
  chart: null,
};

/** Per-category budget calculation used by both the HTML and the chart. */
interface BudgetRow {
  name: string;
  color: string;
  budget: number;
  spent: number;
  over: boolean;
}

interface BudgetData {
  budgeted: BudgetRow[];        // categories that have a monthly budget
  unbudgeted: { name: string; color: string; spent: number }[];
  totalBudget: number;
  totalSpentBudgeted: number;   // spending within budgeted categories only
  totalSpent: number;           // all spending (budgeted + unbudgeted)
  totalIncome: number;
  totalExpenses: number;        // all expenses, for the cashflow strip
}

export async function renderDashboard(container: HTMLElement): Promise<void> {
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }

  const [categories, settings] = await Promise.all([getCategories(), getAllSettings()]);
  state.categories = categories.filter(c => !c.archived);
  state.settings = settings;
  if (!state.year) {
    const ym = currentYearMonth();
    state.year = ym.year;
    state.month = ym.month;
  }

  await loadAndRender(container);
}

async function loadAndRender(container: HTMLElement): Promise<void> {
  const monthStartDay = state.settings.monthStartDay ?? 1;
  const { startDate, endDate } = getMonthRange(state.year, state.month, monthStartDay);
  state.transactions = await getTransactionsByDateRange(startDate, endDate);

  // Card data (only fetched when the relevant feature is enabled).
  state.goals = state.settings.goalsEnabled ? await getGoals() : [];
  state.bills = state.settings.billsEnabled ? await getBills() : [];

  if (state.settings.insightsEnabled) {
    const p = prevMonth(state.year, state.month);
    const prevRange = getMonthRange(p.year, p.month, monthStartDay);
    const prevTxs = await getTransactionsByDateRange(prevRange.startDate, prevRange.endDate);
    state.lastMonthExpenses = prevTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  } else {
    state.lastMonthExpenses = 0;
  }

  renderHTML(container);
  buildChart();
  bindEvents(container);
}

function computeBudgetData(): BudgetData {
  const expenses = state.transactions.filter(t => t.type === 'expense');
  const income = state.transactions.filter(t => t.type === 'income');

  const spentByCat = new Map<string, number>();
  for (const t of expenses) {
    spentByCat.set(t.category, (spentByCat.get(t.category) ?? 0) + t.amount);
  }

  const budgeted: BudgetRow[] = [];
  const budgetedNames = new Set<string>();

  for (const cat of state.categories) {
    if (cat.name === INCOME_CATEGORY_NAME) continue;
    if (cat.monthlyBudget && cat.monthlyBudget > 0) {
      const spent = spentByCat.get(cat.name) ?? 0;
      budgeted.push({
        name: cat.name,
        color: cat.color,
        budget: cat.monthlyBudget,
        spent,
        over: spent > cat.monthlyBudget,
      });
      budgetedNames.add(cat.name);
    }
  }
  budgeted.sort((a, b) => b.budget - a.budget);

  const catMap = new Map(state.categories.map(c => [c.name, c]));
  const unbudgeted: { name: string; color: string; spent: number }[] = [];
  for (const [name, spent] of spentByCat.entries()) {
    if (name === INCOME_CATEGORY_NAME) continue;
    if (!budgetedNames.has(name) && spent > 0) {
      unbudgeted.push({ name, color: catMap.get(name)?.color ?? '#94a3b8', spent });
    }
  }
  unbudgeted.sort((a, b) => b.spent - a.spent);

  const totalSpentBudgeted = budgeted.reduce((s, r) => s + r.spent, 0);
  const totalSpentUnbudgeted = unbudgeted.reduce((s, r) => s + r.spent, 0);

  return {
    budgeted,
    unbudgeted,
    totalBudget: budgeted.reduce((s, r) => s + r.budget, 0),
    totalSpentBudgeted,
    totalSpent: totalSpentBudgeted + totalSpentUnbudgeted,
    totalIncome: income.reduce((s, t) => s + t.amount, 0),
    totalExpenses: expenses.reduce((s, t) => s + t.amount, 0),
  };
}

/** Dim (unspent) version of a hex color: append 25% alpha. */
function dimColor(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + '40' : hex;
}

function renderHTML(container: HTMLElement): void {
  const sym = state.settings.currencySymbol ?? '$';
  const data = computeBudgetData();
  const balance = data.totalIncome - data.totalExpenses;

  const hasTransactions = state.transactions.length > 0;
  const hasBudgets = data.totalBudget > 0;
  const hasSpending = data.totalExpenses > 0;
  const showChart = hasBudgets || hasSpending;
  const remaining = data.totalBudget - data.totalSpent;
  const overallOver = remaining < 0;

  const incomeCat = state.categories.find(c => c.name === INCOME_CATEGORY_NAME);

  // Budget legend rows (spent / budget + progress bar)
  const legendHTML = data.budgeted.map(row => {
    const pct = row.budget > 0 ? (row.spent / row.budget) * 100 : 0;
    const fillPct = Math.min(pct, 100);
    const overBy = row.spent - row.budget;
    return `
      <div class="legend-item tappable" data-cat="${encodeURIComponent(row.name)}" data-color="${row.color}">
        <div class="legend-top">
          <span class="legend-dot" style="background:${row.color}"></span>
          <span class="legend-name">${row.name}</span>
          <span class="legend-amt ${row.over ? 'over-budget' : ''}">
            ${sym}${row.spent.toFixed(2)} / ${sym}${row.budget.toFixed(2)}
          </span>
          <button class="row-add" data-cat="${encodeURIComponent(row.name)}" title="Add expense to ${row.name}">+</button>
        </div>
        <div class="budget-bar">
          <div class="budget-bar-fill${row.over ? ' over' : ''}"
               style="width:${fillPct}%;${row.over ? '' : `background:${row.color}`}"></div>
        </div>
        <div class="legend-sub">
          <span class="${row.over ? 'over-budget' : 'legend-pct'}">
            ${row.over ? `Over by ${sym}${overBy.toFixed(2)}` : `${pct.toFixed(0)}% used`}
          </span>
        </div>
      </div>`;
  }).join('');

  const unbudgetedHTML = data.unbudgeted.length > 0 ? `
    <div class="unbudgeted-section">
      <div class="unbudgeted-title">Unbudgeted spending</div>
      ${data.unbudgeted.map(u => `
        <div class="unbudgeted-item tappable" data-cat="${encodeURIComponent(u.name)}" data-color="${u.color}">
          <span class="legend-dot" style="background:${u.color}"></span>
          <span class="legend-name">${u.name}</span>
          <span class="legend-amt expense">${sym}${u.spent.toFixed(2)}</span>
          <button class="row-add" data-cat="${encodeURIComponent(u.name)}" title="Add expense to ${u.name}">+</button>
        </div>`).join('')}
    </div>` : '';

  let centerOrPrompt: string;
  if (showChart) {
    const centerLabel = 'Spent';
    const centerTotal = hasBudgets
      ? `${sym}${data.totalSpent.toFixed(2)}`
      : `${sym}${data.totalExpenses.toFixed(2)}`;
    const centerSub = hasBudgets
      ? `of ${sym}${data.totalBudget.toFixed(2)}`
      : 'this month';
    centerOrPrompt = `
      <div class="chart-wrapper">
        <canvas id="donut-chart"></canvas>
        <div class="chart-center">
          <div class="chart-center-label">${centerLabel}</div>
          <div class="chart-center-total ${hasBudgets && overallOver ? 'over-budget' : ''}">${centerTotal}</div>
          <div class="chart-center-budget">${centerSub}</div>
        </div>
      </div>`;
  } else if (hasTransactions) {
    centerOrPrompt = `
      <div class="empty-state">
        <div class="empty-icon">${icon('target', { size: 32 })}</div>
        <p>No budgets set yet</p>
        <button class="btn-primary" id="go-settings-btn">Set budgets in Settings</button>
      </div>`;
  } else {
    centerOrPrompt = `
      <div class="empty-state">
        <div class="empty-icon">${icon('pie', { size: 32 })}</div>
        <p>No transactions yet</p>
        <button class="btn-primary" id="empty-add-btn">Add your first expense</button>
      </div>`;
  }

  const budgetStrip = hasBudgets ? `
    <div class="budget-strip">
      <div class="budget-strip-item">
        <span class="bs-label">Budget</span>
        <span class="bs-value">${sym}${data.totalBudget.toFixed(2)}</span>
      </div>
      <div class="cashflow-divider"></div>
      <div class="budget-strip-item">
        <span class="bs-label">Spent</span>
        <span class="bs-value ${overallOver ? 'over-budget' : ''}">${sym}${data.totalSpent.toFixed(2)}</span>
      </div>
      <div class="cashflow-divider"></div>
      <div class="budget-strip-item">
        <span class="bs-label">${overallOver ? 'Over' : 'Left'}</span>
        <span class="bs-value ${overallOver ? 'over-budget' : 'income'}">${sym}${Math.abs(remaining).toFixed(2)}</span>
      </div>
    </div>` : '';

  const incomeHTML = data.totalIncome > 0 ? `
    <div class="income-section">
      <div class="income-item tappable" data-cat="${encodeURIComponent(INCOME_CATEGORY_NAME)}" data-color="${incomeCat?.color ?? '#a3e635'}">
        <span class="legend-dot" style="background:${incomeCat?.color ?? '#a3e635'}"></span>
        <span class="legend-name">Income this month</span>
        <span class="legend-amt income">${sym}${data.totalIncome.toFixed(2)}</span>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="dashboard">
      <div class="month-nav">
        <button class="nav-btn" id="prev-month">&#8249;</button>
        <span class="month-label">${formatMonthLabel(state.year, state.month)}</span>
        <button class="nav-btn" id="next-month">&#8250;</button>
      </div>

      ${budgetStrip}

      ${centerOrPrompt}

      ${hasBudgets ? `<div class="legend">${legendHTML}</div>` : ''}

      ${unbudgetedHTML}

      ${incomeHTML}

      ${renderCards(sym)}

      <div class="cashflow-strip">
        <div class="cashflow-item">
          <span class="cf-label">Income</span>
          <span class="cf-value income">${sym}${data.totalIncome.toFixed(2)}</span>
        </div>
        <div class="cashflow-divider"></div>
        <div class="cashflow-item">
          <span class="cf-label">Expenses</span>
          <span class="cf-value expense">${sym}${data.totalExpenses.toFixed(2)}</span>
        </div>
        <div class="cashflow-divider"></div>
        <div class="cashflow-item">
          <span class="cf-label">Balance</span>
          <span class="cf-value ${balance >= 0 ? 'income' : 'expense'}">${sym}${Math.abs(balance).toFixed(2)}</span>
        </div>
      </div>
    </div>`;
}

function renderCards(sym: string): string {
  const s = state.settings;
  const cards: string[] = [];

  // Insights headline
  if (s.insightsEnabled) {
    const thisMonth = state.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const delta = thisMonth - state.lastMonthExpenses;
    const pct = state.lastMonthExpenses > 0 ? (delta / state.lastMonthExpenses) * 100 : null;
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    const deltaCls = delta > 0 ? 'delta up' : delta < 0 ? 'delta down' : 'delta flat';
    const pctStr = pct === null ? '' : `${arrow} ${Math.abs(pct).toFixed(0)}% vs last month`;
    cards.push(`
      <div class="dash-card tappable" data-goto="insights">
        <div class="dash-card-head"><span>${icon('chart', { size: 14 })} Insights</span><span class="dash-card-more">›</span></div>
        <div class="dash-card-body">
          <span class="dash-stat">${sym}${thisMonth.toFixed(2)}</span>
          <span class="${deltaCls}">${pctStr}</span>
        </div>
      </div>`);
  }

  // Tithe
  if (s.tithingEnabled) {
    const income = state.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const given = state.transactions
      .filter(t => t.type === 'expense' && t.category === TITHE_CATEGORY_NAME)
      .reduce((sum, t) => sum + t.amount, 0);
    const owed = income * ((s.tithePercentage ?? 10) / 100);
    const remaining = Math.max(0, owed - given);
    const pct = owed > 0 ? Math.min((given / owed) * 100, 100) : 0;
    cards.push(`
      <div class="dash-card">
        <div class="dash-card-head"><span>${icon('heart', { size: 14 })} Tithe (${s.tithePercentage ?? 10}%)</span></div>
        <div class="tithe-figures">
          <div><span class="tf-label">Owed</span><span class="tf-value">${sym}${owed.toFixed(2)}</span></div>
          <div><span class="tf-label">Given</span><span class="tf-value income">${sym}${given.toFixed(2)}</span></div>
          <div><span class="tf-label">Remaining</span><span class="tf-value ${remaining > 0 ? 'expense' : ''}">${sym}${remaining.toFixed(2)}</span></div>
        </div>
        <div class="budget-bar"><div class="budget-bar-fill" style="width:${pct}%;background:#fbbf24"></div></div>
        ${remaining > 0 ? `<button class="btn-outline give-tithe-btn" data-amount="${remaining.toFixed(2)}">Give tithe</button>` : `<div class="goal-sub"><span>All tithe given ✓</span></div>`}
      </div>`);
  }

  // Bills due soon (next 7 days)
  if (s.billsEnabled) {
    const soon = dueSoon(state.bills, 7);
    const total = soon.reduce((sum, x) => sum + x.bill.amount, 0);
    cards.push(`
      <div class="dash-card tappable" data-goto="bills">
        <div class="dash-card-head"><span>${icon('clock', { size: 14 })} Bills</span><span class="dash-card-more">›</span></div>
        <div class="dash-card-body">
          ${soon.length === 0
            ? `<span class="dash-substat">Nothing due this week</span>`
            : `<span class="dash-stat">${soon.length} due this week</span><span class="dash-substat expense">${sym}${total.toFixed(2)}</span>`}
        </div>
      </div>`);
  }

  // Goals (top 2)
  if (s.goalsEnabled) {
    const top = state.goals.slice(0, 2);
    const goalsInner = top.length === 0
      ? `<span class="dash-substat">No goals yet</span>`
      : top.map(g => {
          const pct = g.targetAmount > 0 ? Math.min((g.currentAmount / g.targetAmount) * 100, 100) : 0;
          return `
            <div class="mini-goal">
              <div class="mini-goal-top">
                <span class="mini-goal-name">${g.name}</span>
                <span class="mini-goal-amt">${sym}${g.currentAmount.toFixed(0)} / ${sym}${g.targetAmount.toFixed(0)}</span>
              </div>
              <div class="budget-bar"><div class="budget-bar-fill" style="width:${pct}%;background:${g.color}"></div></div>
            </div>`;
        }).join('');
    cards.push(`
      <div class="dash-card tappable" data-goto="goals">
        <div class="dash-card-head"><span>${icon('target', { size: 14 })} Goals</span><span class="dash-card-more">›</span></div>
        <div class="dash-card-body">${goalsInner}</div>
      </div>`);
  }

  return cards.length ? `<div class="dash-cards">${cards.join('')}</div>` : '';
}

function buildChart(): void {
  const canvas = document.getElementById('donut-chart') as HTMLCanvasElement | null;
  if (!canvas) return;

  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }

  const data = computeBudgetData();
  const sym = state.settings.currencySymbol ?? '$';

  const values: number[] = [];
  const colors: string[] = [];
  const meta: { name: string; spent: number; budget: number }[] = [];

  if (data.totalBudget > 0) {
    // Budget mode: spent + remaining per budgeted category (Income excluded).
    for (const row of data.budgeted) {
      const bright = Math.min(row.spent, row.budget);
      const remaining = Math.max(0, row.budget - row.spent);
      if (bright > 0) {
        values.push(bright);
        colors.push(row.color);
        meta.push({ name: row.name, spent: row.spent, budget: row.budget });
      }
      if (remaining > 0) {
        values.push(remaining);
        colors.push(dimColor(row.color));
        meta.push({ name: row.name, spent: row.spent, budget: row.budget });
      }
    }
  } else {
    // No budgets: spending breakdown by category (expenses only, Income excluded).
    for (const row of data.unbudgeted) {
      values.push(row.spent);
      colors.push(row.color);
      meta.push({ name: row.name, spent: row.spent, budget: 0 });
    }
  }

  if (values.length === 0) return;

  state.chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: meta.map(m => m.name),
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: 'var(--surface)',
        hoverBorderWidth: 3,
      }],
    },
    options: {
      cutout: '68%',
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items.length ? meta[items[0].dataIndex].name : '',
            label: (ctx) => {
              const m = meta[ctx.dataIndex];
              if (m.budget > 0) {
                const pct = ((m.spent / m.budget) * 100).toFixed(0);
                return ` ${sym}${m.spent.toFixed(2)} / ${sym}${m.budget.toFixed(2)} (${pct}%)`;
              }
              return ` ${sym}${m.spent.toFixed(2)}`;
            },
          },
        },
      },
    },
  });
}

function bindEvents(container: HTMLElement): void {
  container.querySelector('#prev-month')?.addEventListener('click', async () => {
    const p = prevMonth(state.year, state.month);
    state.year = p.year;
    state.month = p.month;
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    await loadAndRender(container);
  });

  container.querySelector('#next-month')?.addEventListener('click', async () => {
    const n = nextMonth(state.year, state.month);
    state.year = n.year;
    state.month = n.month;
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    await loadAndRender(container);
  });

  container.querySelector('#empty-add-btn')?.addEventListener('click', () => navigate('add'));
  container.querySelector('#go-settings-btn')?.addEventListener('click', () => navigate('settings'));

  // Category rows → open that category's purchases page
  container.querySelectorAll('.legend-item.tappable, .unbudgeted-item.tappable, .income-item.tappable').forEach(row => {
    row.addEventListener('click', () => {
      const el = row as HTMLElement;
      const cat = decodeURIComponent(el.dataset.cat ?? '');
      const color = el.dataset.color ?? '#94a3b8';
      if (cat) openCategory(cat, color, state.year, state.month);
    });
  });

  // Per-row quick-add "+" → Add screen prefilled with that category
  container.querySelectorAll('.row-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cat = decodeURIComponent((btn as HTMLElement).dataset.cat ?? '');
      if (cat) {
        setPendingPrefill({ category: cat });
        navigate('add');
      }
    });
  });

  // Dashboard cards → navigate to their screens
  container.querySelectorAll('.dash-card.tappable').forEach(card => {
    card.addEventListener('click', () => {
      const goto = (card as HTMLElement).dataset.goto as Tab;
      if (goto) navigate(goto);
    });
  });

  // Give tithe → prefill Add screen
  container.querySelector('.give-tithe-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const amount = (e.currentTarget as HTMLElement).dataset.amount ?? '';
    setPendingPrefill({ amount, category: TITHE_CATEGORY_NAME });
    navigate('add');
  });
}

export function refreshDashboard(container: HTMLElement): Promise<void> {
  return loadAndRender(container);
}
