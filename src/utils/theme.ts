import { getSetting } from '../db';

export async function applyTheme(): Promise<void> {
  const theme = await getSetting('theme') ?? 'system';
  setTheme(theme as string);
}

export function setTheme(theme: string): void {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  else if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  // 'system' = no attribute, CSS media query handles it
}
