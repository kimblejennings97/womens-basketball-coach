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
| Coaches, assistants, careers, recruiting, NIL, portal, WNBA contracts / trades / draft (planned) | `docs/roadmap.md` |

Keep these files current: when you change a system, update its topic file (current design + knobs + measured results).

## Where things stand (2026-11-17)
- Session 1 built steps 1-3 of the plan + most of step 4's college season: real data (363 D1 teams, 15 WNBA teams),
  derived ratings, calibrated engine, start screen (unknown coach with job offers / pick any team), screens, live game
  viewer with coaching, NCAA regular season, conference tournaments, Selection Sunday + 68-team NCAA tournament,
  WNBA regular season. Not built yet: WNBA playoffs, offseason (draft, recruiting, NIL, portal, contracts, trades, coaching
  carousel, development, aging), injuries, records / Hall of Fame, animation. See `docs/roadmap.md`.
- Verified headlessly only (harnesses + Edge screenshots). The user has not played it yet; iPad is their test device.

## Decisions made with the user (don't re-litigate)
- NCAA D1 only for college (no D2/NAIA for now). One shared world: both leagues simulated every season.
- Calendar: college season Nov-early April (non-conf, conference, conference tournaments, Selection Sunday, NCAA
  tournament), WNBA draft in April, WNBA season May-Sept (+ playoffs), coaching carousel in each league's offseason.
- Every possession simulated; rules match the real NCAA / WNBA books (js/engine/rules.js).
- In-game coaching: offensive style + pace, defensive formation + press, rotations / subs, timeouts, late-game fouling.
- Player ratings 1-20 (list in js/data/gen.js RATINGS). Real ratings derived from stats (docs/data.md).
- Coaches have 1-20 ratings that grow; up to 3 assistant coaches, hired when moving to a new job or when an
  assistant's contract runs out. NIL is part of college recruiting. WNBA contracts follow a simplified CBA (docs/roadmap.md).
- Real names, rosters and logos for private use; switch to generated players + badges before any public release.
- Never bypass a site's blocking: if a fetch gets 403/429, stop and ask the user to save the pages.

## User preferences
Works autonomously and reports briefly; concise answers with a recommendation and **what was and wasn't verified**.
Often away: keep going and report at the end.

## Repo, git
- Local git repo `C:\ClaudeProjects\womens-basketball-coach`, branch `main`. Claude may commit but cannot push. End commit
  messages with the Co-Authored-By line from the session's system reminder. No remote yet.
- `.gitignore`: `dist/`, `tools/cache/` (scraped third-party pages: never upload), `_*.html`.

## Layout
- `index.html` + `js/ui/app.js` (all screens), `css/style.css`.
- `js/engine/`: `game.js` (possession sim, Game class), `rules.js` (league rules, tactics, calibration constants), `rng.js`.
- `js/game/`: `world.js` (state G, new game, coaches, strength, AI tactics, lineups), `sched.js` (calendar, schedules),
  `season.js` (day loop, results, standings, polls, brackets), `saves.js` (IndexedDB slots).
- `js/data/`: `real.js` (GENERATED teams + players), `names.js` (GENERATED name pools), `gen.js` (ratings list, generated players).
- `tools/`: `scrape.py` (fetch pages into tools/cache), `build_data.py` (-> real.js), `fetch_logos.py`, `teamcolors.html`
  + `apply_colors.py`, `targets.py` (real league averages), `fetch.py` (cached rate-limited fetcher; `OFFLINE=1` = cache only).
- `harness.html` (engine calibration), `serve.py` (port 8766, no-cache).

## How to test (no Node)
- Serve: `py serve.py` (port 8766). Python is `py`.
- Headless Edge from PowerShell, same recipe as wrestling-coach: logic tests in a throwaway `_t.html` that writes into
  `<pre id="o">`, run with `--virtual-time-budget=600000 --dump-dom`. Screenshots: `_ui.html` (sets
  `indexedDB = undefined`, drives `window.__dbg.ACTS`), dump the DOM, save as `_w.html`, screenshot that.
- `harness.html?league=ncaa|wnba&n=2000` (generated teams) and `&real=1` (real rosters) print engine averages next to
  the real league averages.
