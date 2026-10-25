import type { Bill, Category } from '../types';
import {
  getBills, saveBill, deleteBill, getCategories, getAllSettings, addTransaction
} from '../db';
import { formatMonthLabel, nextMonth, prevMonth, currentYearMonth, toISODate } from '../utils/dates';
import { icon } from '../utils/icons';

let onChangeCallback: (() => void) | null = null;

export function setBillsOnChange(cb: () => void): void {
  onChangeCallback = cb;
}

interface BillsState {
  year: number;
  month: number;
}

const state: BillsState = { ...currentYearMonth() };

/** "YYYY-MM" period key for a given year/month. */
export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** The day this bill falls on within a given month (clamped to month length). */
function dueDayInMonth(bill: Bill, year: number, month: number): number {
  return Math.min(bill.dueDay, daysInMonth(year, month));
}

export function isPaid(bill: Bill, year: number, month: number): boolean {
  return bill.lastPaidPeriod === periodKey(year, month);
}

/**
 * Bills due within the next `days` days from today that are unpaid for the
 * month they fall in. Monthly-centric; weekly/yearly use a month-based
 * approximation (documented in README).
 */
export function dueSoon(bills: Bill[], days: number): { bill: Bill; date: Date; year: number; month: number }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + days);
  const out: { bill: Bill; date: Date; year: number; month: number }[] = [];

  for (const bill of bills) {
    if (!bill.active) continue;
    // Check this month and next month occurrences.
    for (const offset of [0, 1]) {
      const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = dueDayInMonth(bill, y, m);
      const dueDate = new Date(y, m - 1, day);
      if (dueDate >= today && dueDate <= horizon && !isPaid(bill, y, m)) {
        out.push({ bill, date: dueDate, year: y, month: m });
        break;
      }
    }
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

export async function renderBills(container: HTMLElement): Promise<void> {
  const [bills, categories, settings] = await Promise.all([getBills(), getCategories(), getAllSettings()]);
  const sym = settings.currencySymbol ?? '$';
  const catMap = new Map(categories.map(c => [c.name, c]));

  const soon = dueSoon(bills, 14);
  const dueSoonHTML = soon.length === 0
    ? `<p class="section-note">Nothing due in the next 14 days.</p>`
    : soon.map(({ bill, date, year, month }) => {
        const cat = catMap.get(bill.category);
        return `
          <div class="due-row">
            <span class="row-dot" style="background:${cat?.color ?? '#94a3b8'}"></span>
            <div class="row-info">
              <span class="row-cat">${bill.name}</span>
              <span class="row-date">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${bill.category}</span>
            </div>
            <span class="row-amt expense">${sym}${bill.amount.toFixed(2)}</span>
            <button class="btn-mini mark-paid-btn" data-id="${bill.id}" data-y="${year}" data-m="${month}">Mark paid</button>
          </div>`;
      }).join('');

  container.innerHTML = `
    <div class="bills-screen">
      <div class="screen-header">
        <h2>Bills</h2>
      </div>

      <div class="settings-section">
        <div class="section-header"><span class="section-icon">${icon('clock', { size: 18 })}</span><h3>Due soon</h3></div>
        <div class="due-list">${dueSoonHTML}</div>
      </div>

      <div class="settings-section">
        <div class="section-header"><span class="section-icon">${icon('calendar', { size: 18 })}</span><h3>Calendar</h3></div>
        <div class="month-nav">
          <button class="nav-btn" id="bills-prev">&#8249;</button>
          <span class="month-label">${formatMonthLabel(state.year, state.month)}</span>
          <button class="nav-btn" id="bills-next">&#8250;</button>
        </div>
        ${renderCalendar(bills, catMap, sym)}
        <div class="day-detail" id="day-detail"></div>
      </div>

      <div class="settings-section">
        <div class="section-header"><span class="section-icon">${icon('receipt', { size: 18 })}</span><h3>Manage bills</h3></div>
        <div class="bills-list" id="bills-list">
          ${bills.length === 0
            ? `<p class="section-note">No bills yet. Add one below.</p>`
            : bills.map(b => renderBillRow(b, catMap, sym)).join('')}
        </div>
        <button class="btn-primary" id="new-bill-btn">+ Add Bill</button>
      </div>

      ${renderBillForm(categories)}
    </div>`;

  bindBillsEvents(container, bills, categories, sym);
}

function renderCalendar(bills: Bill[], catMap: Map<string, Category>, _sym: string): string {
  const { year, month } = state;
  const total = daysInMonth(year, month);
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Sun

  // Map day → bills due
  const dayBills = new Map<number, Bill[]>();
  for (const bill of bills) {
    if (!bill.active) continue;
    const day = dueDayInMonth(bill, year, month);
    dayBills.set(day, [...(dayBills.get(day) ?? []), bill]);
  }

  const weekdayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    .map(d => `<div class="cal-weekday">${d}</div>`).join('');

  const cells: string[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(`<div class="cal-cell empty"></div>`);
  for (let day = 1; day <= total; day++) {
    const dueBills = dayBills.get(day);
    const dotColor = dueBills ? (catMap.get(dueBills[0].category)?.color ?? '#94a3b8') : '';
    cells.push(`
      <div class="cal-cell${dueBills ? ' has-bill' : ''}" data-day="${day}">
        <span class="cal-day">${day}</span>
        ${dueBills ? `<span class="cal-dot" style="background:${dotColor}"></span>` : ''}
      </div>`);
  }

  return `
    <div class="calendar-grid">
      ${weekdayHeaders}
      ${cells.join('')}
    </div>`;
}

function renderBillRow(bill: Bill, catMap: Map<string, Category>, sym: string): string {
  const cat = catMap.get(bill.category);
  const paid = isPaid(bill, state.year, state.month);
  return `
    <div class="bill-row${bill.active ? '' : ' inactive'}" data-id="${bill.id}">
      <span class="row-dot" style="background:${cat?.color ?? '#94a3b8'}"></span>
      <div class="row-info">
        <span class="row-cat">${bill.name} ${paid ? '<span class="paid-badge">Paid</span>' : ''}</span>
        <span class="row-date">Day ${bill.dueDay} · ${bill.frequency}${bill.reminderEnabled ? ` · <span class="reminder-dot">${icon('bell', { size: 12 })}</span>` : ''}</span>
      </div>
      <span class="row-amt expense">${sym}${bill.amount.toFixed(2)}</span>
      <div class="row-actions">
        <button class="action-btn bill-edit" data-id="${bill.id}" title="Edit">${icon('edit', { size: 16 })}</button>
        <button class="action-btn bill-delete" data-id="${bill.id}" title="Delete">${icon('trash', { size: 16 })}</button>
      </div>
    </div>`;
}

function renderBillForm(categories: Category[]): string {
  const expenseCats = categories.filter(c => !c.archived && c.name !== 'Income');
  return `
    <div class="bill-form settings-section" id="bill-form" hidden>
      <div class="section-header"><span class="section-icon">${icon('edit', { size: 18 })}</span><h3 id="bill-form-title">New Bill</h3></div>
      <div class="field-group">
        <label class="field-label">Name</label>
        <input class="text-input" id="bill-name" type="text" placeholder="e.g. Rent, Netflix" />
      </div>
      <div class="field-group">
        <label class="field-label">Amount</label>
        <input class="text-input" id="bill-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div class="field-group">
        <label class="field-label">Category</label>
        <div class="category-chips" id="bill-cats">
          ${expenseCats.map(c => `
            <button class="chip" data-cat="${encodeURIComponent(c.name)}" style="--chip-color:${c.color}">
              <span class="chip-dot" style="background:${c.color}"></span>${c.name}
            </button>`).join('')}
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Due day of month (1–31)</label>
        <input class="text-input short-input" id="bill-dueday" type="number" min="1" max="31" value="1" />
      </div>
      <div class="field-group">
        <label class="field-label">Frequency</label>
        <div class="type-toggle" id="bill-freq">
          <button class="type-btn active" data-freq="monthly">Monthly</button>
          <button class="type-btn" data-freq="weekly">Weekly</button>
          <button class="type-btn" data-freq="yearly">Yearly</button>
        </div>
      </div>
      <label class="toggle-row">
        <span class="toggle-label">In-app reminder</span>
        <input type="checkbox" id="bill-reminder" class="toggle-input" checked />
      </label>
      <button class="btn-primary" id="save-bill-btn">Save Bill</button>
      <button class="btn-secondary" id="cancel-bill-btn">Cancel</button>
      <div class="save-error" id="bill-error"></div>
    </div>`;
}

let editingBillId: string | null = null;

function bindBillsEvents(container: HTMLElement, bills: Bill[], categories: Category[], sym: string): void {
  const catMap = new Map(categories.map(c => [c.name, c]));

  container.querySelector('#bills-prev')?.addEventListener('click', () => {
    const p = prevMonth(state.year, state.month); state.year = p.year; state.month = p.month;
    renderBills(container);
  });
  container.querySelector('#bills-next')?.addEventListener('click', () => {
    const n = nextMonth(state.year, state.month); state.year = n.year; state.month = n.month;
    renderBills(container);
  });

  // Calendar day tap → show that day's bills
  container.querySelectorAll('.cal-cell.has-bill').forEach(cell => {
    cell.addEventListener('click', () => {
      const day = parseInt((cell as HTMLElement).dataset.day ?? '0');
      const detail = container.querySelector('#day-detail') as HTMLElement;
      const dueBills = bills.filter(b => b.active && dueDayInMonth(b, state.year, state.month) === day);
      detail.innerHTML = dueBills.map(b => {
        const cat = catMap.get(b.category);
        const paid = isPaid(b, state.year, state.month);
        return `
          <div class="due-row">
            <span class="row-dot" style="background:${cat?.color ?? '#94a3b8'}"></span>
            <div class="row-info">
              <span class="row-cat">${b.name}</span>
              <span class="row-date">${b.category}</span>
            </div>
            <span class="row-amt expense">${sym}${b.amount.toFixed(2)}</span>
            ${paid ? '<span class="paid-badge">Paid</span>' :
              `<button class="btn-mini mark-paid-btn" data-id="${b.id}" data-y="${state.year}" data-m="${state.month}">Mark paid</button>`}
          </div>`;
      }).join('');
      bindMarkPaid(container);
    });
  });

  bindMarkPaid(container);

  // New bill
  const form = container.querySelector('#bill-form') as HTMLElement;
  container.querySelector('#new-bill-btn')?.addEventListener('click', () => {
    editingBillId = null;
    (container.querySelector('#bill-form-title') as HTMLElement).textContent = 'New Bill';
    resetBillForm(container);
    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth' });
  });
  container.querySelector('#cancel-bill-btn')?.addEventListener('click', () => {
    form.hidden = true; editingBillId = null;
  });

  // Chips + freq toggles in form
  container.querySelectorAll('#bill-cats .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('#bill-cats .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
  container.querySelectorAll('#bill-freq .type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#bill-freq .type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  container.querySelector('#save-bill-btn')?.addEventListener('click', () => saveBillForm(container));

  container.querySelectorAll('.bill-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      const bill = bills.find(b => b.id === id);
      if (!bill) return;
      editingBillId = id;
      (container.querySelector('#bill-form-title') as HTMLElement).textContent = 'Edit Bill';
      form.hidden = false;
      (container.querySelector('#bill-name') as HTMLInputElement).value = bill.name;
      (container.querySelector('#bill-amount') as HTMLInputElement).value = String(bill.amount);
      (container.querySelector('#bill-dueday') as HTMLInputElement).value = String(bill.dueDay);
      (container.querySelector('#bill-reminder') as HTMLInputElement).checked = bill.reminderEnabled;
      container.querySelectorAll('#bill-cats .chip').forEach(c => {
        c.classList.toggle('active', decodeURIComponent((c as HTMLElement).dataset.cat ?? '') === bill.category);
      });
      container.querySelectorAll('#bill-freq .type-btn').forEach(b => {
        b.classList.toggle('active', (b as HTMLElement).dataset.freq === bill.frequency);
      });
      form.scrollIntoView({ behavior: 'smooth' });
    });
  });

  container.querySelectorAll('.bill-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      if (confirm('Delete this bill?')) {
        await deleteBill(id);
        await renderBills(container);
        onChangeCallback?.();
      }
    });
  });
}

function bindMarkPaid(container: HTMLElement): void {
  container.querySelectorAll('.mark-paid-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      const y = parseInt((btn as HTMLElement).dataset.y ?? '0');
      const m = parseInt((btn as HTMLElement).dataset.m ?? '0');
      const bills = await getBills();
      const bill = bills.find(b => b.id === id);
      if (!bill) return;
      bill.lastPaidPeriod = periodKey(y, m);
      await saveBill(bill);

      if (confirm(`Marked "${bill.name}" as paid. Also log it as an expense?`)) {
        const day = dueDayInMonth(bill, y, m);
        await addTransaction({
          id: crypto.randomUUID(),
          amount: bill.amount,
          type: 'expense',
          category: bill.category,
          note: bill.name,
          date: toISODate(new Date(y, m - 1, day)),
          createdAt: new Date().toISOString(),
        });
      }
      await renderBills(container);
      onChangeCallback?.();
    });
  });
}

function resetBillForm(container: HTMLElement): void {
  (container.querySelector('#bill-name') as HTMLInputElement).value = '';
  (container.querySelector('#bill-amount') as HTMLInputElement).value = '';
  (container.querySelector('#bill-dueday') as HTMLInputElement).value = '1';
  (container.querySelector('#bill-reminder') as HTMLInputElement).checked = true;
  container.querySelectorAll('#bill-cats .chip').forEach(c => c.classList.remove('active'));
  container.querySelectorAll('#bill-freq .type-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
}

async function saveBillForm(container: HTMLElement): Promise<void> {
  const name = (container.querySelector('#bill-name') as HTMLInputElement).value.trim();
  const amount = parseFloat((container.querySelector('#bill-amount') as HTMLInputElement).value);
  const dueDay = parseInt((container.querySelector('#bill-dueday') as HTMLInputElement).value);
  const reminder = (container.querySelector('#bill-reminder') as HTMLInputElement).checked;
  const activeChip = container.querySelector('#bill-cats .chip.active') as HTMLElement | null;
  const category = activeChip ? decodeURIComponent(activeChip.dataset.cat ?? '') : '';
  const freqBtn = container.querySelector('#bill-freq .type-btn.active') as HTMLElement | null;
  const frequency = (freqBtn?.dataset.freq ?? 'monthly') as Bill['frequency'];
  const errorEl = container.querySelector('#bill-error') as HTMLElement;

  errorEl.textContent = '';
  if (!name) { errorEl.textContent = 'Please enter a name.'; return; }
  if (isNaN(amount) || amount <= 0) { errorEl.textContent = 'Please enter an amount.'; return; }
  if (!category) { errorEl.textContent = 'Please pick a category.'; return; }
  if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) { errorEl.textContent = 'Due day must be 1–31.'; return; }

  const bills = await getBills();
  if (editingBillId) {
    const existing = bills.find(b => b.id === editingBillId);
    if (existing) {
      await saveBill({ ...existing, name, amount, category, dueDay, frequency, reminderEnabled: reminder });
    }
  } else {
    await saveBill({
      id: crypto.randomUUID(),
      name, amount, category, dueDay, frequency,
      active: true,
      reminderEnabled: reminder,
    });
  }

  editingBillId = null;
  await renderBills(container);
  onChangeCallback?.();
}
