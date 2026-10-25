import type { Transaction } from '../types';
import { currentYearMonth, getMonthRange } from './dates';

/** A parsed statement row ready to become a Transaction (or wait for category review). */
export type ParsedStatementRow = {
  date: string;
  amount: number;
  note: string;
  category: string | null; // null = needs user review (credit only)
  importKey: string;
  mapped: boolean;
};

export type StatementPrepareResult = {
  ready: ParsedStatementRow[];
  needsReview: ParsedStatementRow[];
  skippedDuplicates: number;
  skippedOutOfRange: number;
  skippedFiltered: number;
};

// ── CSV helpers ──────────────────────────────────────────────────────────────

/** Parse a CSV string into rows of string fields (handles quoted commas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(c => c.trim() !== '')) rows.push(row);
  }

  return rows;
}

function headerMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    map[h.trim().toLowerCase()] = i;
  });
  return map;
}

function cell(row: string[], map: Record<string, number>, name: string): string {
  const idx = map[name.toLowerCase()];
  if (idx === undefined) return '';
  return (row[idx] ?? '').trim();
}

// ── Vendor categorization (credit) ───────────────────────────────────────────

function normalizeMerchant(raw: string): string {
  let m = raw.toUpperCase().replace(/['']/g, "'").replace(/"/g, '');
  for (const prefix of ['SQ *', 'TST* ', 'TST*', 'SP ']) {
    if (m.startsWith(prefix)) m = m.slice(prefix.length);
  }
  return m.trim();
}

/**
 * Returns a category name if the merchant matches a known rule, else null.
 * Walmart+ is checked before Walmart so memberships land in Other.
 */
export function applyVendorCategory(merchant: string): string | null {
  const m = normalizeMerchant(merchant);

  if (m.includes('WALMART+') || m.includes('WALMART +')) return 'Other';

  if (
    m.includes('WALMART') ||
    m.includes('WAL-MART') ||
    m.includes('WM SUPERCENTER')
  ) {
    return 'Groceries';
  }

  if (
    m.includes("SAM'S CLUB") ||
    m.includes('SAMS CLUB') ||
    m.includes('SAMSCLUB')
  ) {
    return 'Groceries';
  }

  if (m.includes("SMITH'S FOOD") || m.includes('SMITHS FOOD')) return 'Groceries';
  if (m.includes('FAREWAY')) return 'Groceries';

  if (
    m.includes('MAVERIK') ||
    m.includes("CASEY'S") ||
    m.includes('CASEYS') ||
    m.includes('CHEVRON') ||
    m.includes('KWIK TRIP') ||
    m.includes('KWIK STAR') ||
    /(^|[^A-Z])BP([^A-Z]|$)/.test(m) ||
    m.startsWith('BP ') ||
    m === 'BP'
  ) {
    return 'Gas';
  }

  if (
    m.includes('MCDONALD') ||
    m.includes('TEXAS ROADHOUSE') ||
    m.includes('CHICK-FIL') ||
    m.includes('CHIK-FIL') ||
    m.includes('IN-N-OUT') ||
    m.includes('SONIC') ||
    m.includes('LEATHERBY')
  ) {
    return 'Food & Dining';
  }

  if (
    m.includes('AMAZON') ||
    m.includes('GOODWILL') ||
    m.includes('365 RETAIL') ||
    m.includes('365 MARKET') ||
    m.includes('365 PAY') ||
    m.includes('365 ')
  ) {
    return 'Other';
  }

  if (m.includes('GEICO')) return 'Bills & Utilities';

  return null;
}

// ── Import keys ──────────────────────────────────────────────────────────────

export function creditImportKey(date: string, time: string, amount: number): string {
  return `cc|${date}|${time}|${amount.toFixed(2)}`;
}

export function debitImportKey(date: string, amount: number, description: string): string {
  const norm = description.toUpperCase().replace(/\s+/g, ' ').trim();
  return `dc|${date}|${amount.toFixed(2)}|${norm}`;
}

export function existingImportKeys(transactions: Transaction[]): Set<string> {
  const keys = new Set<string>();
  for (const t of transactions) {
    if (t.importKey) keys.add(t.importKey);
  }
  return keys;
}

// ── Budget month filter ──────────────────────────────────────────────────────

export function getCurrentBudgetRange(monthStartDay: number): {
  startDate: string;
  endDate: string;
} {
  const { year, month } = currentYearMonth();
  return getMonthRange(year, month, monthStartDay);
}

function inRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

function emptyResult(): StatementPrepareResult {
  return {
    ready: [],
    needsReview: [],
    skippedDuplicates: 0,
    skippedOutOfRange: 0,
    skippedFiltered: 0,
  };
}

// ── Credit statement ─────────────────────────────────────────────────────────

export function prepareCreditImport(
  csvText: string,
  monthStartDay: number,
  existingKeys: Set<string>
): StatementPrepareResult {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return emptyResult();

  const map = headerMap(rows[0]);
  for (const required of ['date', 'time', 'amount', 'type', 'merchant']) {
    if (map[required] === undefined) {
      throw new Error('Not a credit card statement. Expected columns: Date, Time, Amount, Type, Merchant.');
    }
  }

  const { startDate, endDate } = getCurrentBudgetRange(monthStartDay);
  const ready: ParsedStatementRow[] = [];
  const needsReview: ParsedStatementRow[] = [];
  let skippedDuplicates = 0;
  let skippedOutOfRange = 0;
  let skippedFiltered = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = cell(row, map, 'date');
    const time = cell(row, map, 'time');
    const amountRaw = cell(row, map, 'amount');
    const type = cell(row, map, 'type');
    const merchant = cell(row, map, 'merchant');
    const description = cell(row, map, 'description');
    const status = cell(row, map, 'status');

    if (!date || !amountRaw) {
      skippedFiltered++;
      continue;
    }

    // Purchases only (Posted or Pending). Skip Payment, Refund, Fee, Other, Declined.
    if (type.toLowerCase() !== 'purchase') {
      skippedFiltered++;
      continue;
    }
    if (status.toLowerCase() === 'declined') {
      skippedFiltered++;
      continue;
    }

    if (!inRange(date, startDate, endDate)) {
      skippedOutOfRange++;
      continue;
    }

    const amount = Math.abs(parseFloat(amountRaw));
    if (isNaN(amount) || amount === 0) {
      skippedFiltered++;
      continue;
    }

    const importKey = creditImportKey(date, time, amount);
    if (existingKeys.has(importKey)) {
      skippedDuplicates++;
      continue;
    }

    const category = applyVendorCategory(merchant);
    const parsed: ParsedStatementRow = {
      date,
      amount,
      note: merchant || description || 'Purchase',
      category,
      importKey,
      mapped: category !== null,
    };

    if (category === null) needsReview.push(parsed);
    else ready.push(parsed);
  }

  return { ready, needsReview, skippedDuplicates, skippedOutOfRange, skippedFiltered };
}

// ── Debit statement ──────────────────────────────────────────────────────────

export function prepareDebitImport(
  csvText: string,
  monthStartDay: number,
  existingKeys: Set<string>
): StatementPrepareResult {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return emptyResult();

  const map = headerMap(rows[0]);
  if (map['date'] === undefined || map['amount'] === undefined || map['description'] === undefined) {
    throw new Error('Not a debit card statement. Expected columns: Date, Description, Amount.');
  }

  const { startDate, endDate } = getCurrentBudgetRange(monthStartDay);
  const ready: ParsedStatementRow[] = [];
  let skippedDuplicates = 0;
  let skippedOutOfRange = 0;
  let skippedFiltered = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = cell(row, map, 'date');
    const description = cell(row, map, 'description');
    const amountRaw = cell(row, map, 'amount');

    if (!date || !amountRaw) {
      skippedFiltered++;
      continue;
    }

    const signed = parseFloat(amountRaw);
    if (isNaN(signed)) {
      skippedFiltered++;
      continue;
    }

    // Outflows only (negative). Skip payroll / income.
    if (signed >= 0) {
      skippedFiltered++;
      continue;
    }

    if (!inRange(date, startDate, endDate)) {
      skippedOutOfRange++;
      continue;
    }

    const amount = Math.abs(signed);
    const importKey = debitImportKey(date, amount, description);
    if (existingKeys.has(importKey)) {
      skippedDuplicates++;
      continue;
    }

    ready.push({
      date,
      amount,
      note: description || 'Debit purchase',
      category: 'Other',
      importKey,
      mapped: true,
    });
  }

  return {
    ready,
    needsReview: [],
    skippedDuplicates,
    skippedOutOfRange,
    skippedFiltered,
  };
}

/** Convert a finalized parsed row into a Transaction ready for IndexedDB. */
export function toTransaction(row: ParsedStatementRow, category: string): Transaction {
  return {
    id: crypto.randomUUID(),
    amount: row.amount,
    type: 'expense',
    category,
    note: row.note,
    date: row.date,
    createdAt: new Date().toISOString(),
    importKey: row.importKey,
  };
}
