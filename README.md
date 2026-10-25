# PocketPie 🥧

A personal, offline budgeting PWA for iPhone. No accounts. No server. No internet required after install.

## Core Features

- **Budget donut dashboard** — the ring is sized by each category's monthly budget. The bright part of each slice fills up as you spend; the dim part is what's left. Over budget turns red.
- **Per-category budgets** — set a monthly budget per category in Settings; the legend shows `spent / budget` with a progress bar.
- **Budget-vs-actual strip** — total Budget / Spent / Left at the top of the dashboard.
- **Fast expense entry** — add a transaction in about 3 taps.
- **Transaction history** — browse and search past months. Edit or delete any entry.
- **Custom categories** — add, rename, recolor, and archive categories.
- **Month navigation** — flip between months on any screen.
- **Light & dark themes** — follows system preference, or set manually.
- **JSON and CSV backup/restore** — keep your data safe in iCloud Drive.
- **100% offline** — works in airplane mode after one-time install.
- **iOS home screen installable** — open in Safari → Share → Add to Home Screen. Free, no App Store.

## Optional Features (toggle in Settings → Features)

All of these are **off by default** and can be turned on/off any time. Turning one off hides its UI everywhere but **never deletes your data** — it reappears intact when re-enabled.

- **Savings Goals** — set targets (e.g. "Emergency Fund $1,000"), log contributions, and track progress with a bar. A compact card on the dashboard shows your top goals.
- **Bills & Reminders** — enter recurring bills, see what's **due soon**, view a month **calendar** with due dates marked, and **mark bills paid** (optionally logging the matching expense). When you open the app, an in-app banner reminds you of bills due within 3 days.
- **Insights** — month-over-month spending, top categories, daily average, projected month-end total, biggest expenses, and a 6-month trend chart.
- **Tithing** — tracks a configurable percentage of income (default 10%). Shows Owed / Given / Remaining on the dashboard with a "Give tithe" quick button. Optional: auto-log a Tithe expense whenever you add income.

When more than one optional feature is enabled, the extra tabs collapse into a **"More"** button in the bottom bar so it stays thumb-friendly (max 5 items).

## Install

See [SETUP.md](SETUP.md) for step-by-step installation instructions written for non-developers.

**TL;DR:** Deploy the `dist/` folder to Netlify (free), open the URL in iPhone Safari, Share → Add to Home Screen.

## Tech Stack

- **Vite** + **Vanilla TypeScript**
- **Chart.js v4** — donut chart
- **idb** — IndexedDB wrapper
- **vite-plugin-pwa** / Workbox — service worker + precaching

Zero server dependencies. Zero runtime network calls.

## What's NOT possible (and why)

| Feature | Why it's impossible |
|---------|---------------------|
| Automatic bank sync | Requires a paid aggregator service (e.g. Plaid, SimpleFIN) and a server. Breaks the "offline / no hosting" requirement. |
| Reading Apple Wallet transactions | No third-party API exists for this on iOS. Impossible even for native apps. |
| Reading purchase push notifications | iOS doesn't allow any app to read another app's notifications. Impossible. |
| App Store distribution | Apple rejects "repackaged website" PWAs. Home-screen install is the correct, free path. |

The fast manual entry + optional Siri Shortcut (see SETUP.md) is the recommended capture strategy.

### Honest limitations of optional features

- **Bill reminders are in-app only, not system push.** iOS PWAs can't reliably send background push notifications, so PocketPie shows a banner when you open the app rather than pretending to push you a notification.
- **Bills are optimized for monthly recurrence.** Weekly and yearly frequencies are supported in the form, but the calendar and "due soon" logic treat the due-day as a day-of-month recurrence (a reasonable approximation for a personal, offline tool).
- **Auto-tithe is off by default** because keeping an auto-created expense in sync with edited/deleted income is fiddly; the Owed/Given/Remaining tracker is the primary, reliable experience.

## Data & Privacy

All data is stored on your device in IndexedDB. Nothing leaves your phone. There is no account, no sync, no analytics, no third-party anything.

**⚠️ Important:** iOS may clear PWA storage after ~7 days of no use, or when Safari data is cleared. Export your data regularly via Settings → Export JSON. See SETUP.md for details.

## Credits

Design and UX inspired by:
- **[ExpenseOwl](https://github.com/Tanq16/ExpenseOwl)** by Tanq16 — MIT License. We used its dashboard layout, cashflow strip, category toggle behavior, and CSV column format as visual references. PocketPie's architecture (serverless IndexedDB instead of a Go server) is entirely different.
- **[Ocular](https://github.com/refi64/ocular)** — MIT License. Referenced for clean budget-vs-actual styling.

PocketPie is an independent, personal project and is not affiliated with either project.

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build → dist/
```

Generate PWA icons (needed once):

```bash
node scripts/gen-icons.mjs
```
