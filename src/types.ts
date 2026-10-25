export type Transaction = {
  id: string;
  amount: number;
  type: 'expense' | 'income';
  category: string;
  note?: string;
  date: string;       // "YYYY-MM-DD"
  createdAt: string;  // ISO timestamp
  sourceId?: string;  // links auto-generated tx (e.g. auto-tithe) back to its source
  importKey?: string; // fingerprint from statement import (dedupe on re-import)
};

export type Category = {
  id: string;
  name: string;
  color: string;
  order: number;
  monthlyBudget?: number;
  archived?: boolean;
};

export type Settings = {
  currencySymbol: string;
  monthStartDay: number;
  theme: 'system' | 'light' | 'dark';
  // Feature toggles (all default OFF so existing users see no change)
  goalsEnabled: boolean;
  billsEnabled: boolean;
  insightsEnabled: boolean;
  tithingEnabled: boolean;
  tithePercentage: number;   // default 10
  titheAutoAdd: boolean;     // default false
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  color: string;
  targetDate?: string;   // ISO "YYYY-MM-DD"
  order: number;
  createdAt: string;
  contributions?: { date: string; amount: number }[];
};

export type Bill = {
  id: string;
  name: string;
  amount: number;
  category: string;      // references a Category name
  dueDay: number;        // 1–31
  frequency: 'monthly' | 'weekly' | 'yearly';
  active: boolean;
  reminderEnabled: boolean;
  lastPaidPeriod?: string; // e.g. "2026-07"
  note?: string;
};

export type FeatureFlags = {
  goals: boolean;
  bills: boolean;
  insights: boolean;
  tithing: boolean;
};

export type Tab =
  | 'dashboard'
  | 'add'
  | 'history'
  | 'goals'
  | 'bills'
  | 'insights'
  | 'settings'
  | 'category';
