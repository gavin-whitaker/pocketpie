import './style.css';
import { seedDefaults, getFeatureFlags, getBills } from './db';
import { applyTheme } from './utils/theme';
import { icon } from './utils/icons';
import type { IconName } from './utils/icons';
import { renderDashboard } from './screens/Dashboard';
import { renderAddTransaction, setOnSave, setEditingTransaction } from './screens/AddTransaction';
import { renderHistory, setOnEdit } from './screens/History';
import { renderSettings, setOnChange } from './screens/Settings';
import { renderGoals, setGoalsOnChange } from './screens/Goals';
import { renderBills, setBillsOnChange, dueSoon } from './screens/Bills';
import { renderInsights } from './screens/Insights';
import { renderCategoryDetail } from './screens/CategoryDetail';
import { setNavigator } from './nav';
import type { Tab, FeatureFlags } from './types';

const TAB_META: Record<Tab, { icon: IconName; label: string }> = {
  dashboard: { icon: 'pie', label: 'Dashboard' },
  add:       { icon: 'plus', label: 'Add' },
  history:   { icon: 'list', label: 'History' },
  goals:     { icon: 'target', label: 'Goals' },
  bills:     { icon: 'clock', label: 'Bills' },
  insights:  { icon: 'chart', label: 'Insights' },
  settings:  { icon: 'settings', label: 'Settings' },
  // 'category' is a routable sub-page, never shown in the bottom nav.
  category:  { icon: 'tag', label: 'Category' },
};

async function init(): Promise<void> {
  await seedDefaults();
  await applyTheme();
  navigator.storage?.persist?.();

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="app-shell">
      <div class="screen-container" id="screen-container"></div>
      <div class="more-menu" id="more-menu" hidden></div>
      <nav class="bottom-nav" id="bottom-nav"></nav>
    </div>`;

  const screenContainer = document.getElementById('screen-container')!;
  let currentTab: Tab = 'dashboard';
  let featureTabs: Tab[] = [];

  const params = new URLSearchParams(window.location.search);
  const quickAdd = params.get('add');
  const quickAmount = params.get('amount') ?? '';
  const quickCategory = params.get('category') ?? '';

  async function reRenderNav(): Promise<void> {
    const flags = await getFeatureFlags();
    featureTabs = [];
    if (flags.goals) featureTabs.push('goals');
    if (flags.bills) featureTabs.push('bills');
    if (flags.insights) featureTabs.push('insights');
    buildNav(featureTabs, currentTab);
  }

  function buildNav(features: Tab[], active: Tab): void {
    const nav = document.getElementById('bottom-nav')!;
    const moreMenu = document.getElementById('more-menu')!;
    moreMenu.hidden = true;

    // Keep bottom bar <= 5 items. If more than 1 feature, collapse features into "More".
    let visible: Tab[];
    let overflow: Tab[] = [];
    if (features.length <= 1) {
      visible = ['dashboard', 'add', 'history', ...features, 'settings'];
    } else {
      visible = ['dashboard', 'add', 'history', 'settings'];
      overflow = features;
    }

    const activeInOverflow = overflow.includes(active);

    const buttons = visible.map(tab => {
      const m = TAB_META[tab];
      const isActive = tab === active;
      // Insert "More" just before Settings when there is overflow.
      const moreBtn = (overflow.length && tab === 'settings')
        ? `<button class="nav-tab${activeInOverflow ? ' active' : ''}" data-more="1">
             <span class="nav-icon">${icon('more', { size: 22 })}</span><span class="nav-label">More</span>
           </button>`
        : '';
      return moreBtn + `
        <button class="nav-tab${isActive ? ' active' : ''}" data-tab="${tab}">
          <span class="nav-icon">${icon(m.icon, { size: 22 })}</span>
          <span class="nav-label">${m.label}</span>
        </button>`;
    }).join('');

    nav.innerHTML = buttons;

    moreMenu.innerHTML = overflow.map(tab => {
      const m = TAB_META[tab];
      return `<button class="more-item${tab === active ? ' active' : ''}" data-tab="${tab}">
                <span class="nav-icon">${icon(m.icon, { size: 18 })}</span><span>${m.label}</span>
              </button>`;
    }).join('');

    nav.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => navigateTo((btn as HTMLElement).dataset.tab as Tab));
    });
    nav.querySelector('[data-more]')?.addEventListener('click', () => {
      moreMenu.hidden = !moreMenu.hidden;
    });
    moreMenu.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        moreMenu.hidden = true;
        navigateTo((btn as HTMLElement).dataset.tab as Tab);
      });
    });
  }

  async function navigateTo(tab: Tab, force = false): Promise<void> {
    if (tab === currentTab && !force) return;
    currentTab = tab;
    document.getElementById('more-menu')!.hidden = true;
    screenContainer.innerHTML = '';
    screenContainer.scrollTop = 0;

    const screen = document.createElement('div');
    screen.className = 'screen';
    screenContainer.appendChild(screen);

    switch (tab) {
      case 'dashboard':
        await renderDashboard(screen);
        break;
      case 'add':
        setOnSave(async () => {
          setEditingTransaction(null);
          await navigateTo('dashboard', true);
        });
        await renderAddTransaction(screen, { amount: quickAmount, category: quickCategory });
        break;
      case 'history':
        setOnEdit(async () => { await navigateTo('add', true); });
        await renderHistory(screen);
        break;
      case 'goals':
        setGoalsOnChange(() => {});
        await renderGoals(screen);
        break;
      case 'bills':
        setBillsOnChange(() => {});
        await renderBills(screen);
        break;
      case 'insights':
        await renderInsights(screen);
        break;
      case 'category':
        await renderCategoryDetail(screen);
        break;
      case 'settings':
        setOnChange(async () => { await reRenderNav(); });
        await renderSettings(screen);
        break;
    }

    // Update active states without a full nav rebuild.
    updateActiveTab(tab);
  }

  function updateActiveTab(tab: Tab): void {
    const nav = document.getElementById('bottom-nav')!;
    const moreMenu = document.getElementById('more-menu')!;
    // 'category' is a sub-page of the dashboard; keep the Dashboard tab lit.
    const highlight: Tab = tab === 'category' ? 'dashboard' : tab;
    const inOverflow = !nav.querySelector(`[data-tab="${highlight}"]`);
    nav.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    if (inOverflow) {
      nav.querySelector('[data-more]')?.classList.add('active');
    } else {
      nav.querySelector(`[data-tab="${highlight}"]`)?.classList.add('active');
    }
    moreMenu.querySelectorAll('.more-item').forEach(b => {
      b.classList.toggle('active', (b as HTMLElement).dataset.tab === highlight);
    });
  }

  setNavigator(navigateTo);
  await reRenderNav();

  const startTab: Tab = quickAdd ? 'add' : 'dashboard';
  await navigateTo(startTab, true);

  const flags = await getFeatureFlags();
  checkReminders(flags);
}

function checkReminders(flags: FeatureFlags): void {
  (async () => {
    // Bills due soon (in-app reminder only — not system push)
    if (flags.bills) {
      const bills = await getBills();
      const soon = dueSoon(bills.filter(b => b.reminderEnabled), 3);
      if (soon.length > 0) {
        const names = soon.map(s => s.bill.name).join(', ');
        showBanner(`${soon.length} bill${soon.length === 1 ? '' : 's'} due soon: ${names}`, 'reminder');
      }
    }

  })();
}

function showBanner(msg: string, kind: 'reminder'): void {
  const banner = document.createElement('div');
  banner.className = `backup-banner ${kind}`;
  banner.innerHTML = `
    <span>${icon('clock', { size: 16, className: 'banner-icon' })}${msg}</span>
    <button class="banner-close" title="Dismiss">${icon('close', { size: 16 })}</button>`;
  document.querySelector('.app-shell')?.prepend(banner);
  banner.querySelector('.banner-close')?.addEventListener('click', () => banner.remove());
}

init().catch(console.error);
