# Command Center — Personal Productivity Hub

Offline-first PWA: fixed daily/weekly/monthly Activities, a To-Do board,
Weekly/Monthly Plans with deadlines, a Calendar, a free-form Routine page,
Habit streaks (daily/weekly/monthly), Sticky Notes, a rich-text Journal,
gamified Levels, a Notices/changelog board, a completion History log, and
a per-task countdown timer with sound + browser notification.

## Run it locally (required — PWAs don't work from a double-clicked file)

```bash
cd command-center
python3 -m http.server 8080
```
Then open **http://localhost:8080**.

No Python? With Node: `npx serve .`

## Install as a desktop app

Once it's open in the browser, click the install icon (⊕) in Chrome/Edge's
address bar, or use the browser menu → "Install Command Center…". After the
first load the service worker caches everything, so it works fully offline
afterward — close the tab, disconnect, reopen any time.

## What's where

| Tab | What it's for |
|---|---|
| **Dashboard** | Today's completion %, planned vs. actual time, habit overview, upcoming deadlines, this week's plan |
| **Activities** | Fixed routines — pick Daily / Weekly / Monthly from the dropdown (e.g. Daily → read a book, Weekly → training, Monthly → haircut). Not on the Calendar. |
| **To-Do** | Kanban board (To-Do / In Progress / Done) for multi-step work, with an optional deadline per card and a one-click ✓ to mark complete |
| **Weekly Plan** / **Monthly Plan** | What you're doing next week / month — text + date + time + optional deadline. Feeds the Calendar. |
| **Upcoming** | A general future task list — priority, countdown timer |
| **Calendar** | Auto-populated from To-Do deadlines, Weekly/Monthly Plan dates, and Level deadlines — click a day to see what's on it |
| **Routine** | A free-text page for writing out your daily routine |
| **Habits** | Daily / Weekly / Monthly streak tracking — frequency is fixed once you create a habit |
| **Sticky Notes** | Draggable colored notes |
| **Journal** | Rich-text (Bold/Underline/Italic/bullets) dated entries — rename the section, delete old entries |
| **Levels** | Gamified sequential tasks — see "Levels" below |
| **Updates** | Your own notice board + a built-in changelog of what's new in the app |
| **History** | Every completed item from every section, grouped — click a group to expand it |

You can also **drag tab names in the top bar** to reorder the whole navigation.

## Levels (gamified tasks)

Add a level with either an hours countdown, or a specific date & time
deadline. Only the first incomplete level is active — later ones stay
locked (can't be checked off) until you finish the one before it. If you
miss a level's deadline, you get a grace period equal to **half** the
original deadline. Miss that too, and **all levels lock for 24 hours** as
a penalty before you can try again. Level deadlines with a specific date
also show up on the Calendar.

## Timer

Every Activities/Upcoming task has a **countdown timer**: set the minutes
on the task (any length), hit ▶, and it counts down. When it hits zero you
get a sound (built-in, no file needed) and a browser notification (first
use will prompt for notification permission — allow it if you want the
popup, the sound plays either way). Clicking ▶ again on a running timer
stops it early and banks the partial time.

## Wrap Up Day

The "🧹 Wrap Up Day" button in the top bar downloads a cleanly formatted
`.txt` report (completion %, planned vs. actual time, completed items,
unfinished items, today's journal entry, sticky notes) for your **Daily
Activities**, then clears completed items and resets planned/actual time
for everything else so it's ready for tomorrow.

## History

Every time you complete something — an Activities item, a Weekly/Monthly
Plan item, a To-Do card, or a Level — it's logged to History, grouped by
which section it came from. Click a group's name to expand and see what
you've finished there.

## Backups (JSON) & moving between devices

Use **⬇ (export)** in the top bar to download your entire dataset as a
`.json` file, and **⬆ (import)** to load one back in — this is how you move
your data to another device or browser (there's no cloud sync; it's all
local by design). Importing replaces everything currently on the device
you're importing into.

## Power Reset

The small red **⏻** button in the top-right corner wipes everything —
every task, plan, note, journal entry, habit, and level. Before it wipes
anything, it **automatically downloads a safety backup** so you have a
copy even if you didn't mean to reset. There's still no undo beyond that
backup, so keep the downloaded file if there's anything you want to
restore later.

## Data & backups

Everything lives in your browser's `localStorage`, scoped to whatever
origin you serve it from (e.g. `localhost:8080`) — nothing is sent
anywhere. Clearing that site's browser data will erase it, since there's
no account or cloud sync by design. Use the JSON export above for real
backups or to move to another device.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell — all views live in one page |
| `css/styles.css` | Theme (dark + light), layout, all component styles |
| `js/storage.js` | localStorage persistence + migration from older versions |
| `js/app.js` | All application logic |
| `manifest.json` / `sw.js` / `icons/` | PWA install + offline caching |

Everything is plain HTML/CSS/JS, no build step, no dependencies — open any
file in an editor and change away. Colors and fonts are CSS variables at
the top of `css/styles.css` under `:root` and `[data-theme="light"]`.
