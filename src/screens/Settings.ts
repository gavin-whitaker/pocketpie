import type { Category, Settings } from '../types';
import {
  getCategories,
  saveCategory,
  deleteCategory,
  getAllSettings,
  setSetting,
  ensureTitheCategory,
  getAllTransactions,
  addTransaction,
} from '../db';
import { setTheme } from '../utils/theme';
import { icon } from '../utils/icons';
import {
  prepareCreditImport,
  prepareDebitImport,
  existingImportKeys,
  toTransaction,
  type ParsedStatementRow,
} from '../utils/statementImport';

let onChangeCallback: (() => void) | null = null;

let pendingReview: {
  ready: ParsedStatementRow[];
  needsReview: ParsedStatementRow[];
  skippedDuplicates: number;
} | null = null;

export function setOnChange(cb: () => void): void {
  onChangeCallback = cb;
}

export async function renderSettings(container: HTMLElement): Promise<void> {
  const [categories, settings] = await Promise.all([getCategories(), getAllSettings()]);
  container.innerHTML = buildHTML(categories, settings);
  bindEvents(container, categories, settings);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function categoryOptions(categories: Category[], selected: string): string {
  const names = categories.filter(c => !c.archived).map(c => c.name);
  if (!names.includes('Other')) names.push('Other');
  return names
    .map(n => `<option value="${escapeHtml(n)}"${n === selected ? ' selected' : ''}>${escapeHtml(n)}</option>`)
    .join('');
}

function buildReviewPanel(rows: ParsedStatementRow[], categories: Category[], sym: string): string {
  return `
    <div class="import-review-panel">
      <p class="section-note">Assign a category for ${rows.length} unmatched merchant${rows.length === 1 ? '' : 's'}, then confirm.</p>
      <div class="import-review-list">
        ${rows.map((r, i) => `
          <div class="import-review-row">
            <div class="import-review-meta">
              <span class="import-review-note">${escapeHtml(r.note)}</span>
              <span class="import-review-amt">${escapeHtml(sym)}${r.amount.toFixed(2)} · ${escapeHtml(r.date)}</span>
            </div>
            <select class="text-input import-cat-select" data-idx="${i}">
              ${categoryOptions(categories, 'Other')}
            </select>
          </div>
        `).join('')}
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button type="button" class="btn-primary" id="confirm-import-btn">Confirm import</button>
        <button type="button" class="btn-outline" id="cancel-import-btn">Cancel</button>
      </div>
    </div>`;
}

function buildCategoryRow(cat: Category, sym: string): string {
  return `
    <div class="cat-row${cat.archived ? ' archived' : ''}" data-id="${cat.id}">
      <span class="cat-color-dot" style="background:${cat.color}"></span>
      <span class="cat-name">${escapeHtml(cat.name)}</span>
      <label class="budget-field" title="Monthly budget">
        <span class="budget-sym">${escapeHtml(sym)}</span>
        <input type="number" inputmode="decimal" min="0" step="1" class="budget-input" data-id="${cat.id}" placeholder="Budget" value="${cat.monthlyBudget ?? ''}" />
      </label>
      <div class="cat-actions">
        <input type="color" class="cat-color-picker" data-id="${cat.id}" value="${cat.color}" title="Change color" />
        <button type="button" class="action-btn archive-btn" data-id="${cat.id}" title="${cat.archived ? 'Restore' : 'Archive'}">
          ${cat.archived ? icon('restore', { size: 16 }) : icon('archive', { size: 16 })}
        </button>
        <button type="button" class="action-btn delete-btn" data-id="${cat.id}" title="Delete">${icon('trash', { size: 16 })}</button>
      </div>
    </div>`;
}

function buildHTML(categories: Category[], settings: Settings): string {
  const sym = settings.currencySymbol ?? '$';
  const reviewHtml = pendingReview
    ? buildReviewPanel(pendingReview.needsReview, categories, sym)
    : '';

  return `
    <div class="settings-screen">
      <h2 class="settings-title">Settings</h2>

      <div class="settings-section">
        <div class="section-header">
          <span class="section-icon">${icon('save', { size: 18 })}</span>
          <h3>Import statements</h3>
        </div>
        <p class="section-note">Import this budget month's purchases from a bank CSV. Re-imports skip duplicates automatically.</p>
        <div class="btn-row">
          <button type="button" class="btn-primary" id="import-credit-btn">Credit card CSV</button>
          <button type="button" class="btn-secondary" id="import-debit-btn">Debit card CSV</button>
        </div>
        <input type="file" id="import-credit-file" accept=".csv,text/csv" hidden />
        <input type="file" id="import-debit-file" accept=".csv,text/csv" hidden />
        <div id="import-status" class="import-status"></div>
        <div id="import-review">${reviewHtml}</div>
      </div>

      <div class="settings-section">
        <div class="section-header">
          <span class="section-icon">${icon('palette', { size: 18 })}</span>
          <h3>Appearance</h3>
        </div>
        <div class="field-group">
          <label class="field-label">Theme</label>
          <div class="type-toggle">
            <button type="button" class="type-btn${settings.theme === 'system' ? ' active' : ''}" data-theme="system">System</button>
            <button type="button" class="type-btn${settings.theme === 'light' ? ' active' : ''}" data-theme="light">Light</button>
            <button type="button" class="type-btn${settings.theme === 'dark' ? ' active' : ''}" data-theme="dark">Dark</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="section-header">
          <span class="section-icon">${icon('grid', { size: 18 })}</span>
          <h3>Features</h3>
        </div>
        <p class="section-note">Turn extras on or off. Turning one off hides it but keeps your data.</p>

        <label class="toggle-row">
          <div class="toggle-text">
            <span class="toggle-label">Savings Goals</span>
            <span class="toggle-desc">Track savings targets and contributions</span>
          </div>
          <input type="checkbox" class="toggle-input feature-toggle" data-flag="goalsEnabled" ${settings.goalsEnabled ? 'checked' : ''} />
        </label>

        <label class="toggle-row">
          <div class="toggle-text">
            <span class="toggle-label">Bills and Reminders</span>
            <span class="toggle-desc">Upcoming bills and calendar</span>
          </div>
          <input type="checkbox" class="toggle-input feature-toggle" data-flag="billsEnabled" ${settings.billsEnabled ? 'checked' : ''} />
        </label>

        <label class="toggle-row">
          <div class="toggle-text">
            <span class="toggle-label">Insights</span>
            <span class="toggle-desc">Spending trends and monthly recaps</span>
          </div>
          <input type="checkbox" class="toggle-input feature-toggle" data-flag="insightsEnabled" ${settings.insightsEnabled ? 'checked' : ''} />
        </label>

        <label class="toggle-row">
          <div class="toggle-text">
            <span class="toggle-label">Tithing</span>
            <span class="toggle-desc">Track a percent of income to give</span>
          </div>
          <input type="checkbox" class="toggle-input feature-toggle" data-flag="tithingEnabled" ${settings.tithingEnabled ? 'checked' : ''} />
        </label>

        <div class="tithe-options" id="tithe-options" ${settings.tithingEnabled ? '' : 'hidden'}>
          <div class="field-group">
            <label class="field-label">Tithe percentage</label>
            <input class="text-input short-input" id="tithe-pct-input" type="number" min="0" max="100" step="0.5" value="${settings.tithePercentage}" />
          </div>
          <label class="toggle-row">
            <div class="toggle-text">
              <span class="toggle-label">Auto-log tithe on income</span>
              <span class="toggle-desc">Creates a Tithe expense when you add income</span>
            </div>
            <input type="checkbox" class="toggle-input" id="tithe-auto-toggle" ${settings.titheAutoAdd ? 'checked' : ''} />
          </label>
        </div>
      </div>

      <div class="settings-section">
        <div class="section-header">
          <span class="section-icon">${icon('settings', { size: 18 })}</span>
          <h3>Preferences</h3>
        </div>
        <div class="field-group">
          <label class="field-label">Currency symbol</label>
          <input class="text-input short-input" id="currency-input" type="text" maxlength="3" value="${escapeHtml(settings.currencySymbol)}" />
        </div>
        <div class="field-group">
          <label class="field-label">Month start day (1–28)</label>
          <input class="text-input short-input" id="month-start-input" type="number" min="1" max="28" value="${settings.monthStartDay}" />
        </div>
        <button type="button" class="btn-primary" id="save-prefs-btn">Save preferences</button>
        <div id="prefs-saved" class="save-confirm"></div>
      </div>

      <div class="settings-section">
        <div class="section-header">
          <span class="section-icon">${icon('tag', { size: 18 })}</span>
          <h3>Categories</h3>
        </div>
        <div class="category-list">
          ${categories.map(c => buildCategoryRow(c, sym)).join('')}
        </div>
        <div class="new-cat-row">
          <input class="text-input" id="new-cat-name" type="text" placeholder="New category name" />
          <input class="color-input" id="new-cat-color" type="color" value="#60a5fa" />
          <button type="button" class="btn-primary" id="add-cat-btn">Add</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="section-header">
          <span class="section-icon">${icon('info', { size: 18 })}</span>
          <h3>About and install</h3>
        </div>
        <div class="about-text">
          <p><strong>PocketPie</strong> — personal offline budgeting.</p>
          <p>To install on iPhone: open in <strong>Safari</strong> → Share → Add to Home Screen.</p>
          <p>iOS may clear app data after about 7 days unused. Open the app regularly to keep your data.</p>
        </div>
      </div>
    </div>`;
}

function setImportStatus(container: HTMLElement, msg: string, isError = false): void {
  const el = container.querySelector('#import-status') as HTMLElement | null;
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

async function saveRows(rows: ParsedStatementRow[]): Promise<number> {
  let added = 0;
  for (const row of rows) {
    await addTransaction(toTransaction(row, row.category ?? 'Other'));
    added++;
  }
  return added;
}

function bindReviewEvents(container: HTMLElement): void {
  container.querySelector('#cancel-import-btn')?.addEventListener('click', () => {
    pendingReview = null;
    const reviewEl = container.querySelector('#import-review');
    if (reviewEl) reviewEl.innerHTML = '';
    setImportStatus(container, 'Import cancelled.');
  });

  container.querySelector('#confirm-import-btn')?.addEventListener('click', async () => {
    if (!pendingReview) return;

    const selects = container.querySelectorAll('.import-cat-select') as NodeListOf<HTMLSelectElement>;
    const reviewed = pendingReview.needsReview.map((row, i) => {
      const select = [...selects].find(s => s.dataset.idx === String(i));
      return {
        ...row,
        category: select?.value || 'Other',
        mapped: true,
      };
    });

    const skipped = pendingReview.skippedDuplicates;
    const added = await saveRows([...pendingReview.ready, ...reviewed]);
    pendingReview = null;

    const reviewEl = container.querySelector('#import-review');
    if (reviewEl) reviewEl.innerHTML = '';

    setImportStatus(container, `Added ${added} · Skipped ${skipped} duplicates`);
    onChangeCallback?.();
  });
}

async function handleStatementFile(
  container: HTMLElement,
  categories: Category[],
  settings: Settings,
  kind: 'credit' | 'debit',
  file: File
): Promise<void> {
  const text = await file.text();
  const existing = existingImportKeys(await getAllTransactions());
  const monthStart = settings.monthStartDay ?? 1;

  let result;
  try {
    result = kind === 'credit'
      ? prepareCreditImport(text, monthStart, existing)
      : prepareDebitImport(text, monthStart, existing);
  } catch (e) {
    setImportStatus(container, e instanceof Error ? e.message : 'Import failed.', true);
    return;
  }

  if (kind === 'debit' || result.needsReview.length === 0) {
    const added = await saveRows(result.ready);
    pendingReview = null;
    const reviewEl = container.querySelector('#import-review');
    if (reviewEl) reviewEl.innerHTML = '';
    setImportStatus(
      container,
      `Added ${added} · Skipped ${result.skippedDuplicates} duplicates` +
        (result.skippedOutOfRange ? ` · ${result.skippedOutOfRange} outside this month` : '')
    );
    onChangeCallback?.();
    return;
  }

  pendingReview = {
    ready: result.ready,
    needsReview: result.needsReview,
    skippedDuplicates: result.skippedDuplicates,
  };

  const reviewEl = container.querySelector('#import-review');
  if (reviewEl) {
    reviewEl.innerHTML = buildReviewPanel(result.needsReview, categories, settings.currencySymbol ?? '$');
    bindReviewEvents(container);
  }

  setImportStatus(
    container,
    `${result.ready.length} ready · ${result.needsReview.length} need a category · ${result.skippedDuplicates} duplicates skipped`
  );
}

function bindEvents(
  container: HTMLElement,
  categories: Category[],
  settings: Settings
): void {
  container.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = (btn as HTMLElement).dataset.theme as 'system' | 'light' | 'dark';
      await setSetting('theme', theme);
      setTheme(theme);
      container.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  container.querySelectorAll('.feature-toggle').forEach(input => {
    input.addEventListener('change', async () => {
      const flag = (input as HTMLElement).dataset.flag as keyof Settings;
      const checked = (input as HTMLInputElement).checked;
      await setSetting(flag, checked as never);
      if (flag === 'tithingEnabled') {
        const opts = container.querySelector('#tithe-options') as HTMLElement | null;
        if (opts) opts.hidden = !checked;
        if (checked) await ensureTitheCategory();
      }
      onChangeCallback?.();
    });
  });

  container.querySelector('#tithe-pct-input')?.addEventListener('change', async () => {
    const raw = parseFloat((container.querySelector('#tithe-pct-input') as HTMLInputElement).value);
    const pct = isNaN(raw) ? 10 : Math.min(100, Math.max(0, raw));
    await setSetting('tithePercentage', pct);
    onChangeCallback?.();
  });

  container.querySelector('#tithe-auto-toggle')?.addEventListener('change', async () => {
    const checked = (container.querySelector('#tithe-auto-toggle') as HTMLInputElement).checked;
    await setSetting('titheAutoAdd', checked);
    onChangeCallback?.();
  });

  container.querySelector('#save-prefs-btn')?.addEventListener('click', async () => {
    const currency = (container.querySelector('#currency-input') as HTMLInputElement).value || '$';
    const monthStart = parseInt((container.querySelector('#month-start-input') as HTMLInputElement).value, 10) || 1;
    await setSetting('currencySymbol', currency);
    await setSetting('monthStartDay', Math.min(28, Math.max(1, monthStart)));
    const savedEl = container.querySelector('#prefs-saved') as HTMLElement;
    savedEl.textContent = 'Saved';
    setTimeout(() => { savedEl.textContent = ''; }, 2000);
    onChangeCallback?.();
  });

  container.querySelectorAll('.cat-color-picker').forEach(input => {
    input.addEventListener('change', async () => {
      const id = (input as HTMLElement).dataset.id ?? '';
      const color = (input as HTMLInputElement).value;
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      await saveCategory({ ...cat, color });
      const dot = container.querySelector(`.cat-row[data-id="${id}"] .cat-color-dot`) as HTMLElement | null;
      if (dot) dot.style.background = color;
    });
  });

  container.querySelectorAll('.budget-input').forEach(input => {
    input.addEventListener('change', async () => {
      const id = (input as HTMLElement).dataset.id ?? '';
      const raw = (input as HTMLInputElement).value.trim();
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      const parsed = parseFloat(raw);
      const monthlyBudget = raw === '' || isNaN(parsed) || parsed <= 0 ? undefined : parsed;
      await saveCategory({ ...cat, monthlyBudget });
      cat.monthlyBudget = monthlyBudget;
      onChangeCallback?.();
    });
  });

  container.querySelectorAll('.archive-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      await saveCategory({ ...cat, archived: !cat.archived });
      await renderSettings(container);
    });
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id ?? '';
      if (!confirm('Delete this category? Existing transactions with this category will not be deleted.')) return;
      await deleteCategory(id);
      await renderSettings(container);
    });
  });

  container.querySelector('#add-cat-btn')?.addEventListener('click', async () => {
    const nameInput = container.querySelector('#new-cat-name') as HTMLInputElement;
    const colorInput = container.querySelector('#new-cat-color') as HTMLInputElement;
    const name = nameInput.value.trim();
    if (!name) return;
    await saveCategory({
      id: crypto.randomUUID(),
      name,
      color: colorInput.value,
      order: categories.length,
    });
    await renderSettings(container);
  });

  const creditFile = container.querySelector('#import-credit-file') as HTMLInputElement;
  const debitFile = container.querySelector('#import-debit-file') as HTMLInputElement;

  container.querySelector('#import-credit-btn')?.addEventListener('click', () => creditFile.click());
  container.querySelector('#import-debit-btn')?.addEventListener('click', () => debitFile.click());

  creditFile.addEventListener('change', async () => {
    const file = creditFile.files?.[0];
    creditFile.value = '';
    if (!file) return;
    await handleStatementFile(container, categories, settings, 'credit', file);
  });

  debitFile.addEventListener('change', async () => {
    const file = debitFile.files?.[0];
    debitFile.value = '';
    if (!file) return;
    await handleStatementFile(container, categories, settings, 'debit', file);
  });

  if (pendingReview) bindReviewEvents(container);
}
