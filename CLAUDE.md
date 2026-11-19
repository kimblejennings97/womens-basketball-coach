# Women's Basketball Coach — project guide

Football-Manager-style women's basketball coach game: NCAA D1 + WNBA in one shared world, possession-by-possession sim,
live play-by-play with in-game coaching. Browser app, plain ES modules, no build step. Sister project of
`C:\ClaudeProjects\wrestling-coach` (same stack, layout and conventions).

**Read this file, then the topic file(s) for what you are working on:**

| Working on | Read |
|---|---|
| Game engine, rules, tactics, rotation, calibration numbers | `docs/engine.md` |
| Real rosters pipeline, rating derivation, logos, colours, overrides | `docs/data.md` |
| Calendar, schedules, standings, polls, conference tournaments, NCAA tournament, WNBA season | `docs/season.md` |
| Screens, live game viewer, saves | `docs/ui.md` |
| Offseason: eligibility, recruiting, NIL, portal, draft + lottery, WNBA contracts / FA / trades, coach growth, carousel, development, rollover | `docs/offseason.md` |
| Awards, record books, career leaders, Hall of Fame | `docs/legacy.md` |
| Live game court animation | `docs/animation.md` |
| What is left to build, open items | `docs/roadmap.md` |

Keep these files current: when you change a system, update its topic file (current design + knobs + measured results).

## Where things stand (2026-11-18, session 3)
- Session 3 (user's first play notes): Continue stops at each key date (docs/season.md "Key dates") and names it;
  Inbox; Calendar with filters + sim to date; NCAA Tournament scouting invite for WNBA coaches (watch games live);
  live game sim to end of quarter / halftime; fix: messages (e.g. "You are on the clock") stuck on every screen;
  court animation between possessions (walk-up, inbound, outlet, fast breaks; docs/animation.md).

## Earlier state (2026-11-17, end of session 2)
- Steps 1-4 of the plan are built: real data (363 D1 + 15 WNBA teams), calibrated engine, all screens, live game viewer,
  both seasons + postseasons, and the full offseason loop (docs/offseason.md): 5-in-5 eligibility, NIL, recruiting,
  transfer portal, WNBA draft lottery + draft, free agency, cuts, trades, coaching carousel + job offers, coach growth /
  reputation, development + aging, rollover to the next season. Step 5 (awards, records, Hall of Fame; docs/legacy.md) and step 6 (court animation in the live viewer;
  docs/animation.md) done 2026-11-17: all six steps of the original plan are built.
- Engine matches real per-game averages and real margin distributions (docs/engine.md). `multiseason.html` runs N
  seasons and checks league health (rating levels, team-strength spread, margins, recruiting, save size): stable over 5.
- Verified headlessly only (harnesses, multi-season runs, Edge screenshots of every new screen). The user has not played
  it yet; iPad is their test device. Saves ~4.4 MB after a season, +0.2-0.3 MB/season.
- Next: the user's iPad review (court animation motion/size/pace, balance). Watch items: NCAA scoring leader ~34 ppg
  (real ~28-31; side effect of NCAA `cal.skill` 2.7), WNBA margins drift to ~10-11 by year 5 (docs/roadmap.md).
- Hosting: live at https://kimblejennings97.github.io/womens-basketball-coach/ (GitHub Pages; every push to `main` runs
  `.github/workflows/pages.yml`, which builds `dist/` with tools/build_deploy.py). Repo
  github.com/kimblejennings97/womens-basketball-coach is PUBLIC (the user made it public for Pages on a free plan).
  Optional Cloudflare `deploy.bat` kept. `gh` is not installed; the GitHub API works with the stored git credential.

## Decisions made with the user (don't re-litigate)
- NCAA D1 only for college (no D2/NAIA for now). One shared world: both leagues simulated every season.
- Calendar: college season Nov-early April (non-conf, conference, conference tournaments, Selection Sunday, NCAA
  tournament), WNBA draft in April, WNBA season May-Sept (+ playoffs), coaching carousel in each league's offseason.
- Every possession simulated; rules match the real NCAA / WNBA books (js/engine/rules.js).
- In-game coaching: offensive style + pace, defensive formation + press, rotations / subs, timeouts, late-game fouling.
- Player ratings 1-20 (list in js/data/gen.js RATINGS). Real ratings derived from stats (docs/data.md).
- Coaches have 1-20 ratings that grow; up to 3 assistant coaches, hired when moving to a new job or when an
  assistant's contract runs out. Growth is bigger for success at low-prestige programs. NIL is a team budget shared by
  recruits and current players; underpaid players are likelier to transfer. WNBA contracts: simplified CBA, Claude's logic.
- College eligibility: NCAA 5-in-5 (no redshirts); anyone already past 4 years is a 5th year. Roster limit 15 (D1).
- WNBA draft lottery copies the real rules (all non-playoff teams, two-season record, picks 1-2 drawn).
- Host on GitHub Pages (like the wrestling game's public hosting; wrestling actually uses Cloudflare, deploy.bat kept as an option).
- Real names, rosters and logos for private use; switch to generated players + badges before any public release.
- Never bypass a site's blocking: if a fetch gets 403/429, stop and ask the user to save the pages.

## User preferences
Works autonomously and reports briefly; concise answers with a recommendation and **what was and wasn't verified**.
Often away: keep going and report at the end.

## Repo, git
- Local git repo `C:\ClaudeProjects\womens-basketball-coach`, branch `main`. Claude may commit but cannot push. End commit
  messages with the Co-Authored-By line from the session's system reminder. Remote `origin`
  https://github.com/kimblejennings97/womens-basketball-coach.git; the user asked Claude to push (2026-11-17).
- `.gitignore`: `dist/`, `tools/cache/` (scraped third-party pages: never upload), `_*.html`, `.wrangler/`.
- Deploy: push to main -> GitHub Actions builds `dist/` (index.html, css, js, assets) and publishes Pages (Settings ->
  Pages -> Source: GitHub Actions). `py tools/build_deploy.py` builds dist/ locally; `deploy.bat` = optional Cloudflare.

## Layout
- `index.html` + `js/ui/app.js` (all screens), `js/ui/court.js` (live court animation), `css/style.css`.
- `js/engine/`: `game.js` (possession sim, Game class), `rules.js` (league rules, tactics, calibration constants), `rng.js`.
- `js/game/`: `world.js` (state G, new game, coaches, strength, AI tactics, lineups), `sched.js` (calendar, schedules),
  `season.js` (day loop, results, standings, polls, brackets, offseason event hooks), `offseason.js` (archive, coach
  growth, carousel, draft, FA, trades, development, rollover), `recruit.js` (NIL, recruiting, portal), `saves.js`.
- `js/data/`: `real.js` (GENERATED teams + players), `names.js` (GENERATED name pools), `gen.js` (ratings list, generated players).
- `tools/`: `scrape.py` (fetch pages into tools/cache), `build_data.py` (-> real.js), `fetch_logos.py`, `teamcolors.html`
  + `apply_colors.py`, `targets.py` (real league averages), `fetch.py` (cached rate-limited fetcher; `OFFLINE=1` = cache only).
- `harness.html` (engine calibration), `multiseason.html` (N-season league health), `seasontest.html`, `uitest.html`,
  `serve.py` (port 8766, no-cache). Import cycles: world.js <-> offseason.js / recruit.js; never use the other
  module's exports at load time (e.g. `const ovr = p => W.ovr(p)`, not `W.ovr`).

## How to test (no Node)
- Serve: `py serve.py` (port 8766). Python is `py`.
- Headless Edge from PowerShell, same recipe as wrestling-coach: logic tests write into `<pre id="o">`, run with
  `--virtual-time-budget=600000 --dump-dom`. `seasontest.html` = a full two-league season (schedules, poll, bracket,
  playoffs, leaders, save size + pack roundtrip). Screenshots: `uitest.html?shot=<screen>&mode=&team=&cont=&poss=`
  (sets `indexedDB = undefined`, drives `window.__dbg.ACTS`), dump the DOM, save as `_w.html`, screenshot that.
  Throwaway pages are `_*.html` (gitignored); delete them afterwards.
- `harness.html?league=ncaa|wnba&n=2000` (generated teams) and `&real=1` (real rosters) print engine averages and the
  margin distribution next to the real ones (`&mirror=1`, `&tune=`).
- `multiseason.html?seasons=5[&mode=unknown&team=<id>&move=1][&tune=]`: whole calendar with the user's team on auto
  (~60 s a season headless); prints rating levels, team-strength spread, margins, recruiting by prestige tier, draft,
  carousel, save size. Run it after any change to development, recruiting, the portal, FA or the engine.
- `uitest.html?...&until=college-offseason|draft|fa|...` sims the calendar to an offseason stop before the screenshot.
