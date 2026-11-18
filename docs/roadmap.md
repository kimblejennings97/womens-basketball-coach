# Roadmap

Build order agreed with the user (2026-11-17):
1. Data model, real-roster scrape, rating derivation. **Done** (docs/data.md).
2. Game engine + calibration harness. **Done** (docs/engine.md).
3. Screens. **Done** (docs/ui.md).
4. Season loop for both leagues, recruiting, portal, draft, contracts + trades, coaching carousel. **Done**
   (docs/season.md, docs/offseason.md).
5. Stats, records, Hall of Fame. **Done** (docs/legacy.md).
6. Animation. **Done**: court animation in the live viewer (docs/animation.md).

## Open items / ideas
- WNBA salary numbers are placeholders (`SAL` in world.js); replace with the 2026 CBA scale when known. No draft-pick
  trades, no core designation / restricted free agency yet; no AI-AI trades.
- NCAA margins settle around 14-16 (real 16.3) as the generated world takes over from the real rosters; WNBA margins
  drift from ~12 to ~10-11 by season 5 (real 11.8).
- NCAA scoring leader ~34 ppg in a test season (real leaders ~28-31): stars are amplified by the NCAA talent weight
  (`cal.skill` 2.7, chosen to match real margins). Possible fix: damp the usage term for college stars.
- Court animation: simple figures (no dunks / crossovers); old games can't be replayed on the court; motion only checked
  as still frames headlessly (rAF doesn't run on virtual time).
- WNBA schedule builder sometimes gives a team 42 games instead of 44.
- Recruiting has no visits / promises yet (hours + offer + NIL only).
- Public release: switch to generated players + badges (real.js / logos are private-use only).
