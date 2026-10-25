import type { Tab } from './types';

let navigator: ((tab: Tab) => void | Promise<void>) | null = null;

/** Registered by main.ts so any screen can request navigation. */
export function setNavigator(fn: (tab: Tab) => void | Promise<void>): void {
  navigator = fn;
}

export function navigate(tab: Tab): void {
  void navigator?.(tab);
}
