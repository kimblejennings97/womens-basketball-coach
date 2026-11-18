# Awards, record books, Hall of Fame (js/game/legacy.js)

Careers count from the start of the save (2026-27 college / 2027 WNBA). legacy.js imports nothing from world/season.

## Awards (`G.awards` = [{ s: season, k, id, t: team, v: line }], plus `aw` [[season, k]] on the player / coach)
Handed out right after each league's archive (college: day after the title game; WNBA: day after the Finals).
- Value = per-game production (pts + 1.1 reb + 1.4 ast + 1.8 stl + 1.6 blk - 1.2 tov) x availability (games / 28 NCAA,
  / 38 WNBA, capped) + team win% x 7 (NCAA) / 10 (WNBA); eligible with 75% of 20 (NCAA) / 26 (WNBA) games.
- NCAA: National Player of the Year, All-American first / second team (top 10), Freshman of the Year, Defensive POY
  (steals, blocks, defensive rebounds, perimeter / post D), a Player of the Year per conference, Final Four Most
  Outstanding Player (best player of the champion in the Final Four games), Coach of the Year.
- WNBA: MVP, All-WNBA first / second, Rookie of the Year (drafted this season or 0 years' experience), Defensive POY,
  Finals MVP, Coach of the Year.
- Coach of the Year = season performance vs expectations (docs/offseason.md) + 0.35 x win% + 0.06 per tournament win.
- News items for the headline awards; a separate item for awards won by the user's team.

## Records (`G.records[lg]`, top 10 each)
- `game`: points, rebounds, assists, steals, blocks, threes in a game (every game, from the full box score).
- `season` totals and `avg` (pts / reb / ast per game, 20+ NCAA / 26+ WNBA games), written at the archive.
- `tgame`: team points in a game, biggest win; `tseason`: wins, win%, points per game.
- Career leaders and coach leaders are computed on demand from the players' / coaches' histories (`careerLeaders`).
  Retired players are only kept if notable (recruit.js `retire`: any WNBA career, 15+ ppg college season, 60+ games
  at 8+ ppg, or an award), which is what career lists need.

## Hall of Fame (`G.hof`, `hof` season on the person), inductions at rollover
- Players eligible 2-8 seasons after leaving (`left`). Score = pre-save credit (real players: (level - 11) per season
  of experience x 0.55, max 12 seasons; A'ja Wilson ~36) + awards (MVP 12, All-WNBA 5 / 2.5, Finals MVP 4, DPOY 3,
  ROY 1.5; NCAA POY 6, AA 2.5 / 1.2, MOP 2, DPOY 1, FOY 0.5, conf POY 0.3) + WNBA points / 1000 x 2.5 + college points
  / 1000 + 0.4 per WNBA season + titles (NCAA 2.5, WNBA 3). Bar 30; at most 4 a year. College-only stars rarely make it.
- Coaches: retired (or unemployed 64+), score = 5 per title + wins / 60 + 1.5 per award, bar 22, at most 2 a year.

## Screens
History (nav): Awards by season (league toggle), Record book, Career leaders (+ coaches), Hall of Fame. Award badges
and a Hall of Fame tag on player and coach profiles.

## Measured (multiseason.html, 6 seasons)
~60 awards a season; first Hall of Fame class in year 6 (real WNBA veterans). records ~20 KB, awards ~35 KB after 6
seasons. Single-game highs after 6 seasons: NCAA 59 pts / 28 reb / 17 ast; WNBA 48 / 21 / 17.
