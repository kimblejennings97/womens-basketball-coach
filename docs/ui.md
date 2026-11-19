# Screens

Same shell as wrestling-coach: sticky top bar (team, record, date, big Continue button), left nav, cards. All screens
live in `js/ui/app.js`; clicks go through `data-act` (ACTS map), form changes through `data-ch`.

- Start: coach name; "Unknown coach" (four job offers from small D1 programs, 3-year contract) or "Pick any team"
  (NCAA / WNBA list with search). Saved games list (load / delete).
- Top bar: the big Continue button names where it stops next: the next key date for your league (`S.nextStop`,
  docs/season.md) if it comes before your next game, else the next game; "You are on the clock" / "Choose a new job" when
  something must be decided. Messages (`ui.msg`) clear on Continue and when you change screens.
- Home: team card, next game, news, conference standings, AP top 10.
- Inbox: `G.inbox` (max 200; `mail()` / `news(me=1)` in sched.js). Kinds: results (box score link), events (every
  calendar stop's message), news (injuries, awards, staff...), invites (Accept / Decline). Tabs per kind with unread
  counts; opening the inbox marks items read (an open invite stays unread). Nav shows "Inbox (n)".
- Calendar: month grid (prev / next / today), league filter (both / NCAA / WNBA), team filter (my team, all teams = game
  counts per league, or any team). Key dates in gold, your results W/L. Click a day: its events and games (box links),
  and "Sim to <date>": plays every day before it (your games simmed with your plan, scouting days skipped), stops at the
  start of that day, or early for job offers, your draft pick or the WNBA re-signing window; everything on the way is
  filed in the inbox.
- Scouting (WNBA coaches who accepted the NCAA Tournament invite): on scouting days the day's tournament games are
  listed (seeds, top two seniors per team) with "Watch live" (spectator: same viewer, no bench controls); Continue plays
  the day. Players on teams playing that day get `p.scouted` = season: a "scouted" tag on the draft board.
- Roster: every rating as a 1-20 chip (red < 9, yellow 9-12, green 13-16, gold 17+), sortable columns, season line.
- Tactics: offense, pace, defense, press, late-game fouling (with descriptions); rotation = five starters + target
  minutes (total 200), or automatic.
- Schedule, Standings (league + conference), Rankings (AP Top 25, WNBA power), Tournaments (conference tournaments,
  NCAA bracket with First Four, WNBA playoff series), Stats (league leaders), Teams (all teams by conference), Staff
  (your ratings, assistants; hire / release while the staff window is open).
- Profiles: team (roster / schedule / staff ratings / history: season, record, poll, postseason, coach), player (bio,
  recruit stars / draft slot / NIL deal, ratings by group, real last-season line, season stats; retired players: career
  table only), coach (ratings rounded, career by season).
- Recruiting (college): hours / open spots / NIL budget header; Board (interest bar + your rank among offering teams,
  leader, hours 0-8, Offer, NIL $K offer vs ask), Prospects (filters: position, stars, committed; top 150), Transfer
  portal (while open), NIL + retention (deal per player, market value, transfer risk).
- Draft: lottery order + odds before the draft, declared / projected prospects; during the draft best available (Draft
  buttons when on the clock, auto-pick) and the picks so far; last draft's first round.
- Free agency (WNBA): payroll / cap / roster, expiring contracts (re-sign at the ask), free agents (sign at the ask).
- Trades (WNBA): partner select, both rosters with checkboxes and trade value, propose (AI answer shown).
- Job offers: offers with contract, accept or stay (forced choice when fired). Nav shows "Job offers (n)".
- Roster: Release button on your own team; NIL column (college). Home: "Coming up" calendar card.
- History: awards by season (league toggle), record book, career leaders (players + coaches), Hall of Fame (docs/legacy.md).
- Game menu: "Let my staff handle the offseason" (`G.user.auto`: AI makes recruiting, NIL, draft and FA decisions).
- Box score: quarter line, both teams' player lines, team totals.
- Pregame: scouting of both top fives, "Coach the game live" or "Sim the game".
- Live game: animated court above the feed (docs/animation.md; "Court" toggle), scoreboard (team fouls, bonus, timeouts), play-by-play feed or live box score, speed (slow / normal / fast
  / turbo), pause, sim to end of the quarter (pauses), sim to halftime (Q1 only), sim to end; auto-pause at the end of each period. Your bench: call timeout (taken at the next dead
  ball), manual-subs toggle (otherwise the auto rotation runs your plan), live tactic changes, click a player on the
  floor then one on the bench to sub (energy bar, minutes, points, fouls, OVR).

Logos: `<img>` of `assets/logos/<league>/<id>.png`; if missing, it swaps itself for a coloured initials badge.
Saves: IndexedDB `wbbCoach`, auto-save after every day and game (~4.4 MB after a season, +0.2 MB a season; players,
history stats and ratings packed as arrays).

Testing: `uitest.html?shot=<screen>&team=&until=<stop>[,<stop>]&tab=k:v&offers=1` (until = sim the calendar to that stop).
