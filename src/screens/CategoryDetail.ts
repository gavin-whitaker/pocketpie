import type { Transaction } from '../types';
import {
  getTransactionsByDateRange, getAllSettings, deleteTransaction, getAllTransactions
} from '../db';
import {
  getMonthRange, formatMonthLabel, nextMonth, prevMonth, currentYearMonth, formatDate
} from '../utils/dates';
import { navigate } from '../nav';
import { setEditingTransaction, setPendingPrefill } from './AddTransaction';
import { icon } from '../utils/icons';

interface CategoryState {
  category: string;
  color: string;
  year: number;
  month: number;
}

const state: CategoryState = {
  category: '',
  color: '#94a3b8',
  ...currentYearMonth(),
};

/** Opens the category purchases page for the given category + month. */
export function openCategory(category: string, color: string, year: number, month: number): void {
  state.category = category;
  state.color = color;
  state.year = year;
  state.month = month;
  navigate('category');
}

export async function renderCategoryDetail(container: HTMLElement): Promise<void> {
  const settings = await getAllSettings();
  const sym = settings.currencySymbol ?? '$';
  const { startDate, endDate } = getMonthRange(state.year, state.month, settings.monthStartDay ?? 1);

  const all = await getTransactionsByDateRange(startDate, endDate);
  const txs = all
    .filter(t => t.category === state.category)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const total = txs.reduce((s, t) => s + (t.type === 'expense' ? t.amount : -t.amount), 0);

  const rows = txs.length === 0
    ? `<div class="history-empty">No purchases in this category for ${formatMonthLabel(state.year, state.month)}.</div>`
    : txs.map(t => `
        <div class="history-row" data-id="${t.id}">
          <span class="row-dot" style="background:${state.color}"></span>
          <div class="row-info">
            <span class="row-cat">${t.note || t.category}</span>
            <span class="row-date">${formatDate(t.date)}</span>
          </div>
          <div class="row-right">
            <span class="row-amt ${t.type === 'income' ? 'income' : 'expense'}">
              ${t.type === 'income' ? '+' : '-'}${sym}${t.amount.toFixed(2)}
            </span>
            <div class="row-actions">
              <button class="action-btn edit-btn" data-id="${t.id}" title="Edit">${icon('edit', { size: 16 })}</button>
              <button class="action-btn delete-btn" data-id="${t.id}" title="Delete">${icon('trash', { size: 16 })}</button>
            </div>
          </div>
        </div>`).join('');

  container.innerHTML = `
    <div class="category-screen">
      <div class="cat-detail-header">
        <button class="back-btn" id="cat-back">‹ Back</button>
        <div class="cat-detail-title">
          <span class="legend-dot" style="background:${state.color}"></span>
          <span>${state.category}</span>
        </div>
      </div>

      <div class="month-nav">
        <button class="nav-btn" id="cat-prev">&#8249;</button>
        <span class="month-label">${formatMonthLabel(state.year, state.month)}</span>
        <button class="nav-btn" id="cat-next">&#8250;</button>
      </div>

      <div class="cat-total-strip">
        <span class="cat-total-label">Total this month</span>
        <span class="cat-total-value">${sym}${Math.abs(total).toFixed(2)}</span>
      </div>

      <div class="history-list">
        ${rows}
      </div>

      <button class="btn-primary cat-add-btn" id="cat-add">+ Add expense to ${state.category}</button>
    </div>`;

  bindEvents(container, txs);
}

function bindEvents(container: HTMLElement, txs: Transaction[]): void {
  container.querySelector('#cat-back')?.addEventListener('click', () => navigate('dashboard'));

  container.querySelector('#cat-prev')?.addEventListener('click', () => {
    const p = prevMonth(state.year, state.month);
    state.year = p.year; state.month = p.month;
    renderCategoryDetail(container);
  });
  container.querySelector('#cat-next')?.addEventListener('click', () => {
    const n = nextMonth(state.year, state.month);
    state.year = n.year; state.month = n.month;
    renderCategoryDetail(container);
  });

  container.querySelector('#cat-add')?.addEventListener('click', () => {
    setPendingPrefill({ category: state.category });
    navigate('add');
  });

  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      const tx = txs.find(t => t.id === id);
      if (tx) {
        setEditingTransaction(tx);
        navigate('add');
      }
    });
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      if (confirm('Delete this transaction?')) {
        await deleteTransaction(id);
        // Remove any auto-generated transaction linked to this one (e.g. auto tithe).
        const linked = (await getAllTransactions()).filter(t => t.sourceId === id);
        for (const l of linked) await deleteTransaction(l.id);
        await renderCategoryDetail(container);
      }
    });
  });
}
