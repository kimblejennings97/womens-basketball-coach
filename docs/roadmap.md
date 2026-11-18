# Roadmap and planned systems

Build order agreed with the user (2026-11-17):
1. Data model, real-roster scrape, rating derivation. **Done** (docs/data.md).
2. Game engine + calibration harness. **Done** (docs/engine.md).
3. Screens: start, profiles, roster, game plan, schedule, box scores, standings. **Done** (docs/ui.md).
4. Season loop for both leagues, then recruiting, portal, draft, contracts + trades, coaching carousel. **Partly done:**
   NCAA regular season, conference tournaments, Selection Sunday, NCAA tournament, WNBA season + playoffs. Next: offseason.
5. Stats, records, Hall of Fame (season stats are recorded; records / HOF not yet).
6. Animation.

## Designed, not built yet
### Offseason (both leagues on one calendar)
- College: seniors / graduates leave; early entrants declare for the WNBA draft (age 22 in the draft year, or four years
  out of high school, or graduated). Transfer portal opens after the NCAA tournament. Recruiting runs through the season
  (official visits, offers, signing in November and April); NIL budget is part of the pitch.
- WNBA: draft (3 rounds, lottery for the 4 non-playoff teams... adjust to the 15-team league), free agency, re-signing,
  trades checked against the cap. Undrafted / cut players go overseas off-screen and can come back.
- Player development and aging (potential, coach development rating, minutes played).
- Coaching carousel in each league's offseason: firings by expectation vs results, job openings, offers for the user
  (reputation-based), contract negotiation.

### Coaches (partly built)
- Built: head coach + up to 3 assistants per team, ratings off/def/gm/rec/dev/mot (1-20), staff ratings = head coach +
  40% of the gap where an assistant is better in their specialty. Staff window for the user at a new job (closes at the
  first game). Engine uses off/def/gm (small effects).
- To build: rating growth (experience, results, development, recruiting classes), reputation, job security, contracts
  ending, assistant contracts ending (opens the staff window), assistants poached / promoted.

### WNBA contracts (simplified CBA, user approved "use your logic for now")
- Hard salary cap, rookie scale for draft picks, minimum / max / supermax salaries, 1-4 year deals, restricted and
  unrestricted free agency, core designation, trades must fit under the cap. Placeholder numbers in world.js `SAL`
  (2025 CBA scale); the 2026 CBA numbers should replace them once known.

### Not decided yet
- College eligibility model: 4 seasons in 5 years with redshirts (current NCAA) vs 5-in-5. Rosters use FR/SO/JR/SR/GR.
- How many roster spots and scholarships (D1 women's: 15 scholarships before the House settlement; roster limits now).
- Injuries (wrestling-coach has a model to copy).
