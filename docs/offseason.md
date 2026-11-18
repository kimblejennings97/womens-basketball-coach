# Offseason, careers, recruiting, NIL, portal, draft, WNBA contracts

Code: `js/game/offseason.js` (archive, coach growth, prestige, departures, draft, free agency, trades, carousel,
development, rollover), `js/game/recruit.js` (NIL, recruiting classes, weekly recruiting, transfer portal). Hooks run from
`season.js offseasonEvents()` on the calendar dates below. Decisions agreed with the user on 2026-11-17 are marked (U).

## Calendar (season Y; `calendar(Y)` in sched.js)
| When | What | Stop for the user |
|---|---|---|
| Nov (start) | new recruiting class on the board (generated at rollover / new game, ~6 quiet weeks of pre-commitments) | |
| Mondays to May 20 | recruiting week: interest, commitments | |
| Jan 21 | WNBA re-signing window (AI re-signs; the user's expiring players are flagged) | `fa` (WNBA coach) |
| Feb 1 | WNBA open market; Mondays after: asks drop 7%, AI teams top up | |
| day after the title game | college archive, coach growth, prestige, departures, NCAA coaching carousel | `college-offseason` or `jobs` |
| +4 days | carousel jobs filled (offers expire) | |
| +3 days (`portal`) | transfer portal opens | |
| first Monday at least 4 days after the final (2nd Monday of April normally) | WNBA draft | `draft` when the user is on the clock |
| May 20 | signing period ends (`recruitEnd`); portal closes ~6 weeks after it opened | |
| 3 days before the WNBA opener | cuts to 12, short rosters filled | |
| Aug 5 | WNBA trade deadline (trades reopen after the Finals) | |
| day after the WNBA Finals | WNBA archive, coach growth, prestige, draft lottery, WNBA carousel | `jobs` |
| 4 days before the next college opener | rollover to season Y+1 | `new-season` |

`pendingStop()`: the calendar will not move while the user is fired (must pick a job) or on the clock in the draft.

## College eligibility and rosters (U)
- NCAA 5-in-5: five seasons in five years, no redshirts. Classes FR / SO / JR / SR / GR (shown "5th"). Real data: a
  2026-27 senior who was already a senior (or graduate) on a 2025-26 roster is a 5th year (141 players).
- Roster limit 15 (D1 rule after the House settlement). Short rosters get walk-ons to 12 at rollover.
- After the season: 5th years leave (draft pool if draft value >= 10.5, else graduate); seniors declare (draft value >=
  12.3, 85%) or move on (30%) or return as 5th years; juniors with draft value >= 14.3 declare 35% of the time.
  Draft value = 0.75 OVR + 0.25 POT. 8 international prospects join the pool each year.

## NIL (U: team budget across recruits and current players; underpaid players may transfer)
- Budget/yr = (15k + 3k x prestige^1.75) x 1.3 in a power conference (ACC, Big Ten, Big 12, SEC, Big East): ~$25K at
  prestige 2, ~$185K at 10, ~$760K at 20 (power).
- Market value = 1.5k x e^(0.36 (OVR - 5)) (OVR 12 ~$19K, 16 ~$80K). AI teams pay 65-110% of value to the best players
  first, up to 85% of the budget. Recruits ask by stars (5: ~$90K, 4: ~$35K, 3: ~$10K, 2: ~$2K, +-30%).
- Committed NIL = current players not leaving + committed recruits; offers and deals must fit the budget.

## Recruiting
- Class: 1,500 seniors; level 11.2 - 7.2 u^0.45 (u = rank / 1500), potential = OVR + 1.8 + 6 (1-u)^3 + noise (top
  recruits have the most upside). Stars: 1-30 five, 31-150 four, 151-500 three, rest two. Only ~1,000-1,200 sign.
- Weekly interest += hours x pull. Pull = prestige fit (0.55 + 0.1/0.13 x (prestige - star need: 16/12.5/8.5/5)) x
  recruiting rating (head coach + coordinator) x NIL offered vs ask x playing time at her position x per-pair affinity x
  coach reputation. Max 8 hours per recruit per week. User hours = 40 + 1.5 x (staff recruiting - 10).
- AI teams target recruits around their prestige slot (3 x open spots), 8 h/week on their four best targets.
- Commitment: interest >= 48 + 8 x (stars - 2) (portal 28), offered, a clear lead (1.2x the next, 1.08x after the
  season), open spot; 25% / week (50% late). At May 20 undecided recruits sign with their favourite offering team; teams
  with spots take leftovers; the rest leave.
- Measured (seasons 2-5): 5-stars go almost all to prestige 15+; p15+ freshmen average ~3.7 stars, p<7 ~2.0.
  Hands-on test: a prestige-17 Iowa putting 8 h + full NIL on the top four recruits landed 1 (LSU took one, two undecided).

## Transfer portal
- Entry chance: 5% base + little playing time (<8 mpg +16%, <15 +8%, top-8 player under 15 mpg +10%) + NIL under
  market value + new head coach (+10%) + good player on a weak team + freshmen +3% (max 60%). The NIL tab shows each
  player's risk. ~650-900 entries a year, ~550-700 land.
- Portal players are recruited like recruits (stars by OVR) and join their new team at once; at close the best leftovers
  go to the most prestigious teams with a spot they improve (75%), the rest leave D1.

## WNBA draft (U: real lottery rules)
- Lottery: every non-playoff team (7 of 15); odds by the combined win% of the last two seasons (one for a new team):
  300/250/180/120/80/45/25 of 1000. Picks 1 and 2 drawn, the rest of the lottery teams worst-first, then playoff teams by
  inverse record. Rounds 2 and 3 by inverse record. The 2027 lottery at new game uses the real 2026 records.
- 3 rounds x 15. AI picks by draft value + a little noise / positional need. The user picks when on the clock (or
  auto-pick). Undrafted: best 20 become free agents, the rest retire.
- College -> pro: every rating drops by `PRO_ADJ` = 1.8 when a college player turns pro (a college 15 is a WNBA
  rotation player ~13). Rookie scale: 1st round $66K + up to $45K by slot, 3 seasons; later rounds minimum, 2 seasons.

## WNBA contracts, free agency, trades (U: "use your logic for now")
- `SAL` placeholders: min $66K, max $250K, hard cap $1.5M. Generated contracts are scaled so teams start under the cap.
- Ask = min + (OVR - 11)/6 x 85% of the range (x0.8 from age 32), years by age (<=26: 3, <=30: 2, else 1).
- AI re-signs players at least as good as its 9th man (age <= 33) if the cap allows. Free agents sign best first and
  choose among teams that want them and can pay, preferring winning teams. Minimum deals are always allowed.
- Rosters: 12 in season, up to 14 in the offseason; cuts by OVR (+ small rookie / youth bonus).
- Trades (user): AI accepts if it gets >= 108% of the value it gives. Value = e^(0.38 (OVR - 12)) x age factor - bad
  contract penalty. Both teams under the cap (or not adding salary over it), rosters 9-12 in season / 9-14 offseason.

## Coaches: growth, reputation, carousel (U: growth + bigger jumps for success at low-prestige programs)
- Season performance = win% - expected win% (from preseason prestige) + postseason vs prestige expectation (NCAA: a
  20 is expected to reach the Elite Eight / Final Four) + conference title.
- Underdog multiplier = clamp(1 + (11 - prestige)/7, 0.6, 2.4). Growth per season for off/def/gm/mot = age base (0.35 under
  40 ... -0.15 over 66) + performance x 3 x multiplier (x0.8 when negative), slower above 17. Development follows how much
  the team's players improved; recruiting follows the class's stars vs prestige. Assistants grow in their specialty.
- Reputation: moves 12% toward the program's prestige each season + 6 x performance x multiplier (x5 when negative),
  +1.5 for a title. Measured: unknown coach at Wright State, 25-7 -> rep 8 -> four offers (p10-12); 26-5 at Northern
  Colorado -> rep 10 -> offers from p13 programs.
- Carousel (after each league's season): contracts ending are renewed if the last two seasons averaged above -0.08 (AI)
  / -0.12 (user, 4-year extension); firings after 2+ seasons below -0.22 (AI, 60%) or 3+ below -0.3 (user); coaches 67+
  retire. Openings are filled by unemployed coaches, assistants or coaches moving up from programs 3+ prestige points
  lower (chains). The user gets up to 4 offers from openings with prestige <= rep + 4 (NCAA) or, with rep >= 12, WNBA
  openings; a fired user always gets two small-program offers. Assistants' contracts ending reopen the user's staff
  window. ~15-55 NCAA openings a year.

## Development and aging (rollover)
- College: each season closes (0.62 + 0.02 (dev - 10)) / years-left of the gap to potential (FR 4 ... GR 2) + up to 0.1
  for minutes + noise. Real players' potential is rescaled at new game (x0.65 of the build's class bump).
- WNBA: <=22 +0.3 (+ potential gap x0.08), <=25 +0.25, <=28 +0.1, <=30 0, <=32 -0.25, <=34 -0.5, else -0.9 (speed /
  vertical / stamina -0.3 more from 31). Retirements from 31 (weak players) / 34-36.
- Prestige: 20% a year toward the team's rank (power rating + postseason) mapped onto the starting prestige distribution
  (`G.presQ`), so the spread of prestige stays the same.

## Measured stability (multiseason.html, 5 seasons, user team on auto)
- NCAA top-8 OVR 8.6 -> ~9.0; team-strength sd 1.51 -> 1.25 (year 2-3) -> 1.59 (year 5); best player 15-17.5.
- WNBA top-8 OVR 14.0 -> 14.4; age 28.6 -> ~27.2; payrolls ~$1.0-1.6M.
- Margins per season: NCAA 16.3 / 15.4 / 14.2 / 14.4 / 16.1 (real 16.3), WNBA 11.9 -> 10.2-11.9 (real 11.8).
- Save ~4.4 MB after season 1, +0.2 MB/season (retired players keep only their stat history, and only notable ones).
