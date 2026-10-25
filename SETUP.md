# PocketPie — Setup Guide

This guide is written for non-developers. Follow it step-by-step and you'll have a private, offline budgeting app on your iPhone home screen in about 10 minutes.

---

## What you need

- A Mac or PC (just to do a one-time deploy)
- An iPhone with Safari
- A free account on **Netlify** or **GitHub Pages** (both are free forever for this kind of app)

---

## Step 1 — Build the app

If you have Node.js installed, open a terminal and run:

```
cd pocketpie
npm install
npm run build
```

This creates a `dist/` folder with the finished app. That folder is all you need.

---

## Step 2 — Put it on the internet (one-time only)

You need HTTPS for the service worker to work on iPhone. The easiest free way:

### Option A — Netlify (recommended, takes 2 minutes)

1. Go to [netlify.com](https://netlify.com) and create a free account.
2. After logging in, look for a box that says **"Drag and drop your site folder here"**.
3. Open your `pocketpie/dist/` folder on your computer.
4. Drag the entire `dist` folder onto that Netlify box.
5. Netlify gives you a URL like `https://abc123.netlify.app`. That's your app!

### Option B — GitHub Pages

1. Create a GitHub account at [github.com](https://github.com).
2. Create a new repository (click the `+` button).
3. Upload all the files inside `dist/` to the repository root.
4. Go to repository Settings → Pages → Source → select "main branch".
5. GitHub gives you a URL like `https://yourusername.github.io/repo-name`.

> **Important:** After you install the app to your iPhone (Step 3), it runs **fully offline**. You don't need Netlify or GitHub anymore. You can even take the site down later. The app lives on your phone.

---

## Step 3 — Install to iPhone home screen

**You MUST use Safari.** Chrome on iOS cannot install PWAs properly.

1. Open Safari on your iPhone.
2. Type in the URL from Step 2 (e.g. `https://abc123.netlify.app`).
3. Wait for the page to fully load.
4. Tap the **Share button** (the box with an arrow pointing up, at the bottom of the screen).
5. Scroll down and tap **"Add to Home Screen"**.
6. Tap **"Add"** in the top right.

PocketPie now appears on your home screen with its own icon. Tap it — it opens full-screen, no browser bar. It works in **airplane mode** from now on.

---

## Step 4 — Back up your data regularly (IMPORTANT)

⚠️ **iOS can delete your app's data** if you don't open the app for about 7 days, or if you clear Safari's data. There is no way around this limitation for free, offline iPhone apps.

**What to do:** Export your data regularly and save it to iCloud Drive or Files.

1. Open PocketPie → tap **Settings** (⚙️ tab).
2. Tap **Export JSON**.
3. A file download will start. Save it to your **iCloud Drive** or **Files** app.
4. To restore later: tap **Import JSON / CSV** and pick your backup file.

**How often?** Export whenever you'd be sad to lose the data. Once a week is a good habit. The app will remind you if it's been more than 7 days since your last export.

---

## Turning extra features on or off

PocketPie starts simple. Extra tools are hidden until you want them.

1. Open PocketPie → tap **Settings** (⚙️).
2. Find the **Features** section near the top.
3. Flip on any of: **Savings Goals**, **Bills & Reminders**, **Insights**, **Tithing**.

Each one you enable adds its own screen (reachable from the bottom bar, or the **"More"** button if several are on) and a small card on the dashboard. Turning a feature **off just hides it** — your goals, bills, and tithe history are kept and come back if you turn it on again.

For **Tithing**, you can set the percentage (default 10%) and, if you want, have the app automatically log your tithe each time you add income.

---

## Optional — Siri / Shortcut for fast expense logging

You can say *"Hey Siri, log an expense"* and have PocketPie open pre-filled.

1. Open the **Shortcuts** app on your iPhone.
2. Tap `+` to create a new Shortcut.
3. Add the action **"Open URL"**.
4. Set the URL to: `https://your-app-url.netlify.app/?add=1&amount=0&category=Groceries`
   - Change `Groceries` to whatever category you use most.
5. Tap the Shortcut name at the top and rename it to something like *"Log expense"*.
6. Tap **Done**.

Now you can say "Hey Siri, Log expense" and PocketPie will open with that category pre-selected. Just type the amount and tap Save.

---

## Troubleshooting

**The app shows a browser bar / doesn't go full-screen**
→ You used Chrome instead of Safari. Reinstall using Safari.

**"Add to Home Screen" is not showing**
→ Scroll down further in the Share sheet. It's below the app suggestions.

**I lost my data**
→ Import your most recent `.json` backup file from iCloud Drive / Files. If you have no backup, the data is gone — this is why exporting regularly is so important.

**The donut chart looks wrong after adding transactions**
→ Tap the Dashboard tab again to refresh.

---

## What's stored where

| Data | Where |
|------|-------|
| Transactions, categories, settings | On your iPhone only (IndexedDB in Safari) |
| Backup files | Wherever you save them (iCloud Drive recommended) |
| App code | On Netlify/GitHub Pages (can be deleted after install; app still works) |

No servers. No accounts. No cloud sync. Your data is 100% yours.
