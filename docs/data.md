# Real data pipeline

Sources (private use only; never bypass blocking: on 403/429 stop and ask the user to save pages):
- Sports-Reference women's college: `/cbb/seasons/women/2027-school-stats.html` (the 363 D1 schools of 2026-27),
  each school's `2027.html` (roster: number, class, position, height, hometown, high school; conference; head coach;
  early-season stats) and `2026.html` (2025-26 player totals, SRS).
- Basketball-Reference WNBA: `/wnba/years/2026.html` (15 teams) and each `teams/XXX/2026.html` (roster with birth date,
  experience, college; player totals; coach; net rating).
- Logos: the team pages' `teamlogo` image (Sports Logos.net via the SR CDN) -> `assets/logos/<league>/<id>.png`.

Pipeline:
1. `py tools/scrape.py` fetches everything into `tools/cache/` (one request per 3.5 s, resumable; ~45 min cold).
2. `py tools/build_data.py` -> `js/data/real.js` (TEAMS, PLAYERS with ratings as arrays in RATING_KEYS order) and
   `js/data/names.js` (first names / surnames of the real players, for generated players). `OFFLINE=1` = cache only.
3. `py tools/fetch_logos.py` downloads logos (1.5 s apart). `tools/teamcolors.html` (headless) + `tools/apply_colors.py`
   pull two colours out of each logo into `tools/colors.json`, which build_data.py merges into TEAMS.
4. `tools/targets.py` computes the real per-team-game league averages the engine is calibrated against.

## Rating derivation (build_data.py)
- Stats: 2025-26 totals (any D1 team, matched by Sports-Reference player id, so transfers keep their stats) + 2026-27
  totals so far, summed. WNBA: 2026 totals.
- Level L (the player's overall level on the 1-20 scale):
  - NCAA: `8.4 + 1.5*z(GameScore per 40) + 1.0*z(min per game) + 0.068*SRS of the team(s) she played for + 0.4*class bump`
  - WNBA: `13.6 + 1.5*z(GmSc/40) + 1.0*z(mpg) + 0.1*team net rating`
  - shrunk toward a prior by minutes (w = min/(min+250)); prior = team strength + class (NCAA) / experience (WNBA).
  - soft cap: above 13.5 (NCAA) / 15.5 (WNBA) L is squeezed with tanh, so college stars top out ~17, WNBA MVPs ~19.
  - players with no stats (freshmen, some transfers from outside D1): prior + noise, archetype profile.
- Skills: per-40 rates and percentages as z-scores within the league (shrunk toward priors by volume), combined per skill
  (e.g. three = .55 z(3P%) + .5 z(3PA/40)), centred per player, `rating = L + 2.6 * (z - mean z) + 0.25 * archetype`.
  Free throw is absolute: `FT% = 0.47 + 0.024 * rating` (the engine's formula). Players with almost no 3PA get a low three.
- Potential: NCAA L + class bump (FR +4.5 ... GR +0.5) + noise; WNBA by age.
- Positions: SR gives G/F/C; split into PG/SG/SF/PF/C by height, assists and 3PA per 40.
- `tools/overrides.json` `{player_id: {rating: value}}` is applied last.
- 5th years (5-in-5 eligibility): Sports-Reference lists graduate students as SR; a 2026-27 senior who was a senior (or
  GR) on any 2025-26 roster becomes GR (141 players). Unknown class codes become JR in game.
- WNBA rows without a jersey number carry the name in the number cell; build_data.py swaps them (11 players).
- `tools/margins.py`: real game margins (2026 WNBA schedule page + 48 sampled 2025-26 NCAA schedules) -> margins.json,
  the engine's spread-of-results target.

Measured (2026-11-17, full build): 363 D1 teams / 5,003 players, 15 WNBA teams / 218 players (rosters over 12 go to
free agency in game). NCAA L mean 7.8 (p10 5.8, p50 7.4, p90 10.1, max 16.9). Top: Sarah Strong 16.9, Hannah Hidalgo
16.6, Mikayla Blakes 16.3, Madison Booker 16.2, Joyce Edwards 16.1. WNBA L mean 12.8 (p90 15.5): A'ja Wilson 18.4,
Kelsey Mitchell 17.4, Breanna Stewart 17.2, Jackie Young / Caitlin Clark / Paige Bueckers 17.1. Free-throw prior for
low-volume shooters: .71 NCAA, .79 WNBA.

## Turning real data off
Before any public release: replace real.js with generated leagues and badges instead of logos (not built yet).
