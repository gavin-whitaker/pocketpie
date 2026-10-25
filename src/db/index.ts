import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type {
  Transaction, Category, Settings, RecurringRule, Goal, Bill, FeatureFlags
} from '../types';

interface PocketPieDB extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
    indexes: { 'by-date': string; 'by-category': string };
  };
  categories: {
    key: string;
    value: Category;
    indexes: { 'by-order': number };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
  recurring: {
    key: string;
    value: RecurringRule;
  };
  goals: {
    key: string;
    value: Goal;
    indexes: { 'by-order': number };
  };
  bills: {
    key: string;
    value: Bill;
    indexes: { 'by-dueDay': number };
  };
}

const DB_NAME = 'pocketpie';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<PocketPieDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PocketPieDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<PocketPieDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1: original stores. Only create if missing, never drop existing data.
      if (oldVersion < 1) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('by-date', 'date');
        txStore.createIndex('by-category', 'category');

        const catStore = db.createObjectStore('categories', { keyPath: 'id' });
        catStore.createIndex('by-order', 'order');

        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('recurring', { keyPath: 'id' });
      }
      // v2: add goals + bills stores (existing v1 data untouched).
      if (oldVersion < 2) {
        const goals = db.createObjectStore('goals', { keyPath: 'id' });
        goals.createIndex('by-order', 'order');
        const bills = db.createObjectStore('bills', { keyPath: 'id' });
        bills.createIndex('by-dueDay', 'dueDay');
      }
    },
  });

  return dbInstance;
}

// ── Transactions ─────────────────────────────────────────────────────────────

export async function addTransaction(tx: Transaction): Promise<void> {
  const db = await getDB();
  await db.put('transactions', tx);
}

export async function updateTransaction(tx: Transaction): Promise<void> {
  const db = await getDB();
  await db.put('transactions', tx);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('transactions', id);
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  return db.getAll('transactions');
}

export async function getTransactionsByDateRange(
  startDate: string,
  endDate: string
): Promise<Transaction[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(startDate, endDate);
  return db.getAllFromIndex('transactions', 'by-date', range);
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const db = await getDB();
  const cats = await db.getAllFromIndex('categories', 'by-order');
  return cats;
}

export async function saveCategory(cat: Category): Promise<void> {
  const db = await getDB();
  await db.put('categories', cat);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('categories', id);
}

// ── Goals ────────────────────────────────────────────────────────────────────

export async function getGoals(): Promise<Goal[]> {
  const db = await getDB();
  return db.getAllFromIndex('goals', 'by-order');
}

export async function saveGoal(goal: Goal): Promise<void> {
  const db = await getDB();
  await db.put('goals', goal);
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('goals', id);
}

// ── Bills ────────────────────────────────────────────────────────────────────

export async function getBills(): Promise<Bill[]> {
  const db = await getDB();
  return db.getAll('bills');
}

export async function saveBill(bill: Bill): Promise<void> {
  const db = await getDB();
  await db.put('bills', bill);
}

export async function deleteBill(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('bills', id);
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K] | undefined> {
  const db = await getDB();
  const record = await db.get('settings', key as string);
  return record?.value as Settings[K] | undefined;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: key as string, value });
}

export async function getAllSettings(): Promise<Settings> {
  const db = await getDB();
  const all = await db.getAll('settings');
  const result: Partial<Settings> = {};
  for (const { key, value } of all) {
    (result as Record<string, unknown>)[key] = value;
  }
  return {
    currencySymbol: result.currencySymbol ?? '$',
    monthStartDay: result.monthStartDay ?? 1,
    theme: result.theme ?? 'system',
    pinEnabled: result.pinEnabled ?? false,
    pinHash: result.pinHash,
    lastExportAt: result.lastExportAt,
    goalsEnabled: result.goalsEnabled ?? false,
    billsEnabled: result.billsEnabled ?? false,
    insightsEnabled: result.insightsEnabled ?? false,
    tithingEnabled: result.tithingEnabled ?? false,
    tithePercentage: result.tithePercentage ?? 10,
    titheAutoAdd: result.titheAutoAdd ?? false,
  } as Settings;
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const s = await getAllSettings();
  return {
    goals: s.goalsEnabled,
    bills: s.billsEnabled,
    insights: s.insightsEnabled,
    tithing: s.tithingEnabled,
  };
}

// ── Seed Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'groceries',     name: 'Groceries',         color: '#4ade80', order: 0 },
  { id: 'gas',           name: 'Gas',                color: '#f97316', order: 1 },
  { id: 'food',          name: 'Food & Dining',      color: '#fb923c', order: 2 },
  { id: 'necessities',   name: 'Necessities',        color: '#60a5fa', order: 3 },
  { id: 'bills',         name: 'Bills & Utilities',  color: '#c084fc', order: 4 },
  { id: 'rent',          name: 'Rent & Mortgage',    color: '#818cf8', order: 5 },
  { id: 'fun',           name: 'Fun & Entertainment',color: '#f472b6', order: 6 },
  { id: 'health',        name: 'Health',             color: '#34d399', order: 7 },
  { id: 'transport',     name: 'Transport',          color: '#38bdf8', order: 8 },
  { id: 'other',         name: 'Other',              color: '#94a3b8', order: 9 },
  { id: 'income',        name: 'Income',             color: '#a3e635', order: 10 },
];

export const TITHE_CATEGORY_NAME = 'Tithe';
export const INCOME_CATEGORY_NAME = 'Income';

export async function seedDefaults(): Promise<void> {
  const db = await getDB();

  // Only seed if no categories exist
  const existing = await db.count('categories');
  if (existing === 0) {
    const tx = db.transaction('categories', 'readwrite');
    for (const cat of DEFAULT_CATEGORIES) {
      await tx.store.put(cat);
    }
    await tx.done;
  }

  // Only seed settings if not set
  const currency = await getSetting('currencySymbol');
  if (currency === undefined) {
    await setSetting('currencySymbol', '$');
    await setSetting('monthStartDay', 1);
    await setSetting('theme', 'system');
    await setSetting('pinEnabled', false);
  }
}

/** Ensures a "Tithe" category exists (called when tithing is enabled). */
export async function ensureTitheCategory(): Promise<void> {
  const cats = await getCategories();
  if (cats.some(c => c.name === TITHE_CATEGORY_NAME)) return;
  await saveCategory({
    id: crypto.randomUUID(),
    name: TITHE_CATEGORY_NAME,
    color: '#fbbf24',
    order: cats.length,
  });
}

