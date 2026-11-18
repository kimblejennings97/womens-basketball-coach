# Screens

Same shell as wrestling-coach: sticky top bar (team, record, date, big Continue button), left nav, cards. All screens
live in `js/ui/app.js`; clicks go through `data-act` (ACTS map), form changes through `data-ch`.

- Start: coach name; "Unknown coach" (four job offers from small D1 programs, 3-year contract) or "Pick any team"
  (NCAA / WNBA list with search). Saved games list (load / delete).
- Home: team card, next game, news, conference standings, AP top 10.
- Roster: every rating as a 1-20 chip (red < 9, yellow 9-12, green 13-16, gold 17+), sortable columns, season line.
- Tactics: offense, pace, defense, press, late-game fouling (with descriptions); rotation = five starters + target
  minutes (total 200), or automatic.
- Schedule, Standings (league + conference), Rankings (AP Top 25, WNBA power), Tournaments (conference tournaments,
  NCAA bracket with First Four, WNBA playoff series), Stats (league leaders), Teams (all teams by conference), Staff
  (your ratings, assistants; hire / release while the staff window is open).
- Profiles: team (roster / schedule / staff ratings), player (bio, ratings by group, real last-season line, season
  stats), coach.
- Box score: quarter line, both teams' player lines, team totals.
- Pregame: scouting of both top fives, "Coach the game live" or "Sim the game".
- Live game: scoreboard (team fouls, bonus, timeouts), play-by-play feed or live box score, speed (slow / normal / fast
  / turbo), pause, sim to end; auto-pause at the end of each period. Your bench: call timeout (taken at the next dead
  ball), manual-subs toggle (otherwise the auto rotation runs your plan), live tactic changes, click a player on the
  floor then one on the bench to sub (energy bar, minutes, points, fouls, OVR).

Logos: `<img>` of `assets/logos/<league>/<id>.png`; if missing, it swaps itself for a coloured initials badge.
Saves: IndexedDB `wbbCoach`, auto-save after every day and game (~1.5-3 MB per save).
