# PocketPie — Setup Guide

This guide is written for non-developers. Follow it step-by-step and you'll have a private, offline budgeting app on your iPhone home screen in about 10 minutes.

---

## What you need

- A Mac or PC (just to do a one-time deploy)
- An iPhone with Safari
- A free **GitHub** account (holds the code) and a free **Netlify** account (hosts the app)

---

## Step 1 — Run it locally (optional)

If you have Node.js installed, open a terminal and run:

```
cd pocketpie
npm install
npm run dev
```

`npm run build` creates the production `dist/` folder — Netlify runs this for you.

---

## Step 2 — Deploy with Netlify (one-time setup)

You need HTTPS for the service worker to work on iPhone. Netlify provides it for free.

1. Push the `pocketpie` repo to GitHub.
2. In [Netlify](https://app.netlify.com), choose **Add new site → Import an existing project** and pick the repo.
3. Netlify reads `netlify.toml` automatically (build command `npm run build`, publish folder `dist`). Click **Deploy**.
4. Netlify gives you a URL like `https://pocketpie.netlify.app`. That's your app!

Every `git push` to `main` redeploys automatically. The installed app picks up the new version the next time you open it with a connection.

> **Important:** After you install the app to your iPhone (Step 3), it runs **fully offline**. The site only matters for installing and receiving updates. Your data lives on your phone.

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

## Step 4 — Import your bank statements

1. Download a CSV of transactions from your bank / card app and save it to **Files**.
2. Open PocketPie → **Settings** → **Import statements**.
3. Pick the **Month to import** (defaults to the current month; choose an earlier month to back-fill).
4. Tap **Credit card CSV** or **Debit card CSV** and choose the file.

What happens:

- Only purchases inside the selected budget month are added (pending charges included).
- Payments, refunds, fees, declined charges, and deposits are skipped.
- On debit statements, credit card payoffs and transfers between your own accounts are skipped — those purchases already come in from the credit card CSV.
- Known stores (Walmart, Maverik, McDonald's, …) are categorized automatically. Anything else shows up in a short review list where you pick a category before confirming.
- Importing the same file twice is safe: duplicates are skipped.

⚠️ **iOS can delete app data** if you don't open the app for a long time, or if you clear Safari's data. Open PocketPie regularly. Because your bank keeps the statements, you can always re-import a month if needed.

---

## Turning extra features on or off

PocketPie starts simple. Extra tools are hidden until you want them.

1. Open PocketPie → tap **Settings**.
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
→ Re-import each month's credit and debit CSVs (Settings → Import statements, pick the month). Manually added entries can't be recovered.

**An import says "outside this month" for everything**
→ Check the **Month to import** picker — it needs to match the dates in the CSV.

**The donut chart looks wrong after adding transactions**
→ Tap the Dashboard tab again to refresh.

---

## What's stored where

| Data | Where |
|------|-------|
| Transactions, categories, settings | On your iPhone only (IndexedDB in Safari) |
| Statement CSVs | Read on your phone during import; never uploaded |
| App code | GitHub (source) and Netlify (hosting) |

No servers. No accounts. No cloud sync. Your data is 100% yours.
