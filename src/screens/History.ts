import type { Transaction, Settings } from '../types';
import { getTransactionsByDateRange, deleteTransaction, getCategories, getAllSettings, getAllTransactions } from '../db';
import { getMonthRange, formatMonthLabel, nextMonth, prevMonth, currentYearMonth, formatDate } from '../utils/dates';
import { setEditingTransaction, setOnSave } from './AddTransaction';
import { icon } from '../utils/icons';

interface HistoryState {
  year: number;
  month: number;
  filter: string;
}

const state: HistoryState = {
  ...currentYearMonth(),
  filter: '',
};

let onEditCallback: (() => void) | null = null;

export function setOnEdit(cb: () => void): void {
  onEditCallback = cb;
}

export async function renderHistory(container: HTMLElement): Promise<void> {
  const [categories, settings] = await Promise.all([getCategories(), getAllSettings()]);
  const catMap = new Map(categories.map(c => [c.name, c]));
  await loadAndRender(container, catMap, settings);
}

async function loadAndRender(
  container: HTMLElement,
  catMap: Map<string, { color: string }>,
  settings: Settings
): Promise<void> {
  const { startDate, endDate } = getMonthRange(state.year, state.month, settings.monthStartDay ?? 1);
  let txs = await getTransactionsByDateRange(startDate, endDate);
  txs = txs.sort((a, b) => b.date.localeCompare(a.date));

  if (state.filter) {
    const q = state.filter.toLowerCase();
    txs = txs.filter(t =>
      t.category.toLowerCase().includes(q) ||
      (t.note ?? '').toLowerCase().includes(q)
    );
  }

  const sym = settings.currencySymbol ?? '$';

  const rows = txs.length === 0
    ? `<div class="history-empty">No transactions found.</div>`
    : txs.map(t => {
        const cat = catMap.get(t.category);
        const color = cat?.color ?? '#94a3b8';
        return `
          <div class="history-row" data-id="${t.id}">
            <span class="row-dot" style="background:${color}"></span>
            <div class="row-info">
              <span class="row-cat">${t.category}</span>
              ${t.note ? `<span class="row-note">${t.note}</span>` : ''}
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
          </div>`;
      }).join('');

  container.innerHTML = `
    <div class="history-screen">
      <div class="month-nav">
        <button class="nav-btn" id="prev-month">&#8249;</button>
        <span class="month-label">${formatMonthLabel(state.year, state.month)}</span>
        <button class="nav-btn" id="next-month">&#8250;</button>
      </div>

      <div class="search-row">
        <input class="search-input" id="search-input" type="search" placeholder="Filter transactions…" value="${state.filter}" />
      </div>

      <div class="history-list">
        ${rows}
      </div>
    </div>`;

  bindHistoryEvents(container, txs, catMap, settings);
}

function bindHistoryEvents(
  container: HTMLElement,
  txs: Transaction[],
  catMap: Map<string, { color: string }>,
  settings: Settings
): void {
  container.querySelector('#prev-month')?.addEventListener('click', async () => {
    const p = prevMonth(state.year, state.month);
    state.year = p.year;
    state.month = p.month;
    await loadAndRender(container, catMap, settings);
  });

  container.querySelector('#next-month')?.addEventListener('click', async () => {
    const n = nextMonth(state.year, state.month);
    state.year = n.year;
    state.month = n.month;
    await loadAndRender(container, catMap, settings);
  });

  const searchInput = container.querySelector('#search-input') as HTMLInputElement;
  searchInput?.addEventListener('input', async () => {
    state.filter = searchInput.value;
    await loadAndRender(container, catMap, settings);
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id ?? '';
      if (confirm('Delete this transaction?')) {
        await deleteTransaction(id);
        // Remove any auto-generated transaction linked to this one (e.g. auto tithe).
        const linked = (await getAllTransactions()).filter(t => t.sourceId === id);
        for (const l of linked) await deleteTransaction(l.id);
        await loadAndRender(container, catMap, settings);
      }
    });
  });

  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id ?? '';
      const tx = txs.find(t => t.id === id);
      if (tx) {
        setEditingTransaction(tx);
        setOnSave(() => {
          setEditingTransaction(null);
          onEditCallback?.();
        });
        onEditCallback?.();
      }
    });
  });
}
