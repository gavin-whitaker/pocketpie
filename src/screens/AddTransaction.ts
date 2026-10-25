import type { Category, Settings, Transaction } from '../types';
import {
  getCategories, getAllSettings, addTransaction, updateTransaction,
  getAllTransactions, deleteTransaction, ensureTitheCategory, TITHE_CATEGORY_NAME
} from '../db';
import { todayISO } from '../utils/dates';
import { icon } from '../utils/icons';

let onSaveCallback: (() => void) | null = null;
let editingTx: Transaction | null = null;
let pendingPrefill: { amount?: string; category?: string } | null = null;

export function setOnSave(cb: () => void): void {
  onSaveCallback = cb;
}

export function setEditingTransaction(tx: Transaction | null): void {
  editingTx = tx;
}

/** Queues a prefill (amount/category) for the next Add screen render (e.g. "Give tithe"). */
export function setPendingPrefill(prefill: { amount?: string; category?: string }): void {
  pendingPrefill = prefill;
}

export async function renderAddTransaction(
  container: HTMLElement,
  prefill?: { amount?: string; category?: string }
): Promise<void> {
  const [categories, settings] = await Promise.all([getCategories(), getAllSettings()]);
  const expenseCategories = categories.filter(c => !c.archived && c.name !== 'Income');
  const incomeCategories = categories.filter(c => !c.archived);

  const tx = editingTx;
  // Merge any queued in-app prefill (e.g. from the dashboard "Give tithe" button).
  const effectivePrefill = { ...(prefill ?? {}), ...(pendingPrefill ?? {}) };
  pendingPrefill = null;
  const sym = settings.currencySymbol ?? '$';
  const defaultType = tx?.type ?? 'expense';
  const defaultAmount = tx ? String(tx.amount) : (effectivePrefill.amount ?? '');
  const defaultCategory = tx?.category ?? effectivePrefill.category ?? '';
  const defaultNote = tx?.note ?? '';
  const defaultDate = tx?.date ?? todayISO();

  container.innerHTML = `
    <div class="add-screen">
      <div class="add-header">
        <h2>${tx ? 'Edit Transaction' : 'Add Transaction'}</h2>
      </div>

      <div class="type-toggle">
        <button class="type-btn${defaultType === 'expense' ? ' active' : ''}" data-type="expense">Expense</button>
        <button class="type-btn${defaultType === 'income' ? ' active' : ''}" data-type="income">Income</button>
      </div>

      <div class="amount-display">
        <span class="amount-sym">${sym}</span>
        <input
          id="amount-input"
          class="amount-input"
          type="number"
          inputmode="decimal"
          placeholder="0.00"
          min="0"
          step="0.01"
          value="${defaultAmount}"
          autofocus
        />
      </div>

      <div class="numpad">
        ${['1','2','3','4','5','6','7','8','9','.','0','back'].map(k => `
          <button class="numpad-btn" data-key="${k}">${k === 'back' ? icon('backspace', { size: 20 }) : k}</button>
        `).join('')}
      </div>

      <div class="field-group">
        <label class="field-label">Category</label>
        <div class="category-chips" id="category-chips">
          ${renderChips(expenseCategories, defaultCategory)}
        </div>
      </div>

      <div class="field-group">
        <label class="field-label">Note (optional)</label>
        <input id="note-input" class="text-input" type="text" placeholder="e.g. Costco run" value="${defaultNote}" />
      </div>

      <div class="field-group">
        <label class="field-label">Date</label>
        <input id="date-input" class="text-input" type="date" value="${defaultDate}" />
      </div>

      <button class="btn-primary btn-save" id="save-btn">
        ${tx ? 'Update' : 'Save'}
      </button>

      ${tx ? '<button class="btn-secondary" id="cancel-edit-btn">Cancel</button>' : ''}

      <div id="save-error" class="save-error"></div>
    </div>`;

  bindAddEvents(container, expenseCategories, incomeCategories, settings);
}

function renderChips(categories: Category[], selected: string): string {
  return categories.map(c => `
    <button class="chip${c.name === selected ? ' active' : ''}" data-cat="${encodeURIComponent(c.name)}" style="--chip-color:${c.color}">
      <span class="chip-dot" style="background:${c.color}"></span>
      ${c.name}
    </button>
  `).join('');
}

function bindAddEvents(
  container: HTMLElement,
  expenseCats: Category[],
  incomeCats: Category[],
  settings: Settings
): void {
  let currentType: 'expense' | 'income' = editingTx?.type ?? 'expense';
  const amountInput = container.querySelector('#amount-input') as HTMLInputElement;
  const chipsContainer = container.querySelector('#category-chips') as HTMLElement;

  // Type toggle
  container.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = (btn as HTMLElement).dataset.type as 'expense' | 'income';
      container.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cats = currentType === 'expense' ? expenseCats : incomeCats;
      chipsContainer.innerHTML = renderChips(cats, '');
      bindChipEvents(chipsContainer);
    });
  });

  // Numpad
  container.querySelectorAll('.numpad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = (btn as HTMLElement).dataset.key ?? '';
      handleNumpadKey(amountInput, key);
    });
  });

  // Chips
  bindChipEvents(chipsContainer);

  // Save
  container.querySelector('#save-btn')?.addEventListener('click', () => saveTx(container, currentType, settings));
  container.querySelector('#cancel-edit-btn')?.addEventListener('click', () => {
    editingTx = null;
    onSaveCallback?.();
  });
}

function bindChipEvents(chipsContainer: HTMLElement): void {
  chipsContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

function handleNumpadKey(input: HTMLInputElement, key: string): void {
  if (key === 'back') {
    input.value = input.value.slice(0, -1);
    return;
  }
  if (key === '.' && input.value.includes('.')) return;
  const parts = input.value.split('.');
  if (parts[1] !== undefined && parts[1].length >= 2) return;
  input.value += key;
}

async function saveTx(
  container: HTMLElement,
  type: 'expense' | 'income',
  settings: Settings
): Promise<void> {
  const amountInput = container.querySelector('#amount-input') as HTMLInputElement;
  const noteInput = container.querySelector('#note-input') as HTMLInputElement;
  const dateInput = container.querySelector('#date-input') as HTMLInputElement;
  const activeChip = container.querySelector('.chip.active') as HTMLElement | null;
  const errorEl = container.querySelector('#save-error') as HTMLElement;

  const amount = parseFloat(amountInput.value);
  const category = activeChip ? decodeURIComponent(activeChip.dataset.cat ?? '') : '';
  const note = noteInput.value.trim();
  const date = dateInput.value;

  errorEl.textContent = '';

  if (isNaN(amount) || amount <= 0) {
    errorEl.textContent = 'Please enter a valid amount.';
    return;
  }
  if (!category) {
    errorEl.textContent = 'Please select a category.';
    return;
  }
  if (!date) {
    errorEl.textContent = 'Please pick a date.';
    return;
  }

  const tx: Transaction = {
    id: editingTx?.id ?? crypto.randomUUID(),
    amount,
    type,
    category,
    note: note || undefined,
    date,
    createdAt: editingTx?.createdAt ?? new Date().toISOString(),
  };

  const wasEditing = !!editingTx;
  if (wasEditing) {
    await updateTransaction(tx);
  } else {
    await addTransaction(tx);
  }

  // Optional: auto-log tithe when income is added/edited.
  if (settings.tithingEnabled && settings.titheAutoAdd && tx.type === 'income') {
    await syncAutoTithe(tx, settings.tithePercentage ?? 10);
  }

  editingTx = null;

  // Animate save button
  const saveBtn = container.querySelector('#save-btn') as HTMLButtonElement;
  saveBtn.textContent = '✓ Saved';
  saveBtn.classList.add('saved');
  setTimeout(() => {
    onSaveCallback?.();
  }, 400);
}

/**
 * Creates or updates a Tithe expense linked to an income transaction, so the
 * auto-tithe stays in sync when income is edited. Linked via `sourceId`.
 */
async function syncAutoTithe(income: Transaction, percentage: number): Promise<void> {
  await ensureTitheCategory();
  const titheAmount = +(income.amount * (percentage / 100)).toFixed(2);
  const all = await getAllTransactions();
  const existing = all.find(t => t.sourceId === income.id && t.category === TITHE_CATEGORY_NAME);

  if (titheAmount <= 0) {
    if (existing) await deleteTransaction(existing.id);
    return;
  }

  if (existing) {
    await updateTransaction({ ...existing, amount: titheAmount, date: income.date });
  } else {
    await addTransaction({
      id: crypto.randomUUID(),
      amount: titheAmount,
      type: 'expense',
      category: TITHE_CATEGORY_NAME,
      note: 'Auto tithe',
      date: income.date,
      createdAt: new Date().toISOString(),
      sourceId: income.id,
    });
  }
}
