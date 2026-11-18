# Roadmap

Build order agreed with the user (2026-11-17):
1. Data model, real-roster scrape, rating derivation. **Done** (docs/data.md).
2. Game engine + calibration harness. **Done** (docs/engine.md).
3. Screens. **Done** (docs/ui.md).
4. Season loop for both leagues, recruiting, portal, draft, contracts + trades, coaching carousel. **Done**
   (docs/season.md, docs/offseason.md).
5. Stats, records, Hall of Fame. Season stats + player / team / coach histories are kept; record books and the Hall of
   Fame are next (retired players keep their stat history only if notable: see recruit.js `retire`).
6. Animation.

## Open items / ideas
- WNBA salary numbers are placeholders (`SAL` in world.js); replace with the 2026 CBA scale when known. No draft-pick
  trades, no core designation / restricted free agency yet; no AI-AI trades.
- NCAA margins settle around 14-16 (real 16.3) as the generated world takes over from the real rosters.
- WNBA schedule builder sometimes gives a team 42 games instead of 44.
- Recruiting has no visits / promises yet (hours + offer + NIL only).
- Public release: switch to generated players + badges (real.js / logos are private-use only).
