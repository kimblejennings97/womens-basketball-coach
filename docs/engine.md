# Game engine (js/engine/game.js, rules.js)

`new Game(home, away, { league, seed, neutral })`; `step()` plays one possession (with free throws and the rebound);
`run()` plays to the end; `result()` = score, quarter points, box scores, team totals. Every draw comes from the seeded
rng (seed = save seed ^ hash(game id)), so a game can be re-simulated exactly with the same inputs.

## Rules (rules.js RULES, from the real books)
| | NCAA women | WNBA |
|---|---|---|
| Periods | 4 x 10:00, OT 5:00 | 4 x 10:00, OT 5:00 |
| Shot clock / after offensive rebound | 30 / 20 | 24 / 14 |
| Team bonus (2 FTs) | 5th team foul of a quarter; OT fouls carry over from Q4 | 5th foul of a quarter, or 2nd in its last 2:00; OT: 4th |
| Foul out | 5 | 6 |
| Timeouts | 4 (+ media timeout under 5:00 each quarter) | 4 (+ media) |

## A possession
1. Late-game intentional foul by the trailing defence (coach setting auto / foul / never; auto = when down 1-3 and the
   game clock is under the shot clock, or down 4+ inside 40 s + 8 s per point; not when hopeless). Side-outs until the
   bonus, then the worst free-throw shooter on the floor goes to the line.
2. Length: half-court mean (`cal.hcMean`) + pace + offence + zone (+1.2 s) - press (-2.2 s) + noise; transition 3.5-8 s
   (after steals, some defensive rebounds, rarely after makes). Leading late = milk the clock; trailing by 1-3 late =
   last shot; trailing by more = hurry. Running into the shot clock = a rushed shot (8% of those are violations).
3. Turnover: base x exp(-0.06 (team handling - ref) + 0.045 (team steals - ref)) x offence x defence x press; steals
   start transition.
4. Non-shooting foul: team foul, FTs if in the bonus.
5. Shot: shooter by usage (offensive skill, style, box-and-one), zone (rim / post / mid / three) by league mix x style x
   defence x the shooter's relative skill (post shots need size, threes need three rating). Make chance in logit space:
   `logit(base) + 0.055 (zone skill - ref) - 0.04 (defence - ref)` + form (consistency) + coach off/def + home 0.035 +
   transition + clutch (last 5:00 within 5) + assisted (+0.12) - rushed - fatigue (skill x (0.82 + 0.18 energy)).
   Man defence = the matched defender; zones = average of the five in that area; matchup zone adds team IQ.
   Shooting fouls by zone (and-ones), blocks on rim / post (some mid) misses.
6. Rebound: offensive chance = league base + zone defence penalty + 0.022 x (offensive vs defensive rebounding of the
   fives, size included); 4% team rebounds; put-backs come as short rim-heavy possessions.
7. Free throws: `FT% = 0.47 + 0.024 x rating` (+ clutch late); a missed last FT is a live rebound.

## Fatigue and rotation
- Energy 0.3-1: drains on the floor (0.0007/s x pace x press x stamina), recovers on the bench, timeouts, media
  timeouts and quarter / half breaks.
- Auto rotation at each dead ball: the five with the best score = minutes behind the plan (per minute) + freshness
  ((energy - 0.86) x 14) + 1.4 if already on the floor + 0.12 x OVR, at least one guard and at most two centres; foul
  trouble sits (2 in Q1, 3 in Q2, 4 in Q3 for NCAA; one more for the WNBA). Last 4:00 of a game within 10: best five,
  swapping only for a clear upgrade.
- AI calls a timeout on a 9-0 run (never for the user's side in a live game). Manual subs: only forced swaps (foul-outs).

## Tactics (rules.js)
Offences: motion, pick and roll, post, 5-out, dribble drive, Princeton. Pace: push / normal / grind. Defences: man,
2-3, 3-2, 1-3-1, matchup, box-and-one; press on/off; late-game fouling. Multipliers are in OFFENSES / DEFENSES / PACES.
AI teams pick a style from their roster (shooters -> 5-out, good post players -> post, ...) plus a stable per-team flavour.

## Calibration
`harness.html?league=ncaa|wnba&n=2000` (generated teams) / `&real=1` (real rosters). Targets = real per-team-game
averages (tools/targets.py): 2025-26 NCAA D1 and the 2026 WNBA season.

MEASURED_TABLE
