# Calendar, schedules, standings, postseason

One world clock (`G.day` = days since 1970-01-01 UTC, last completed day). `G.season` = the year the college season ends
and the WNBA season is played (2027 = 2026-27 college + 2027 WNBA). `calendar(Y)` in sched.js:
- College: first Tuesday of November (Nov 3, 2026) opens; 12 non-conference dates through Dec 20; 18 conference dates
  Dec 30 - Feb 27 (alternating 3 / 4 days); conference tournaments start 4 days after the last conference date (Mar 3,
  one round per day); Selection Sunday = first Sunday on/after Mar 12 (Mar 14, 2027); First Four Sel+3/+4, rounds 1-2
  Sel+5..+8, Sweet 16 Sel+12/13, Elite Eight Sel+14/15, Final Four Sel+19, title game Sel+21 (Apr 4, 2027).
- WNBA: draft second Monday of April; season from the second Friday of May (44 games) to mid-September; playoffs start
  once the regular season is done.

## Schedules
- NCAA non-conference: each date pairs every team (one bye with an odd count) with a similar-strength non-conference
  opponent (sorted by prestige + noise, no repeats); the stronger program hosts 68% of the time (buy games); some neutral
  sites around Thanksgiving.
- Conference: circle-method double round robin, cut to 18 games (or n-1 if bigger); byes for odd conferences.
- WNBA: every pair 3 times + extra same-conference games to 44; spread greedily over the days (no back-to-backs).

## Day loop (season.js)
`advance(G)` loops days: day events (poll, conference tournament start, Selection Sunday, tournament games for the day),
stops *before* a day with the user's game (`{stop:'game'}`), else plays the day. The UI then shows the pregame screen
(coach live / sim); `finishUserDay` records the user's game and plays the rest of that day. Stops also at
`selection`, `ncaa-champion`, `wnba-champion`.

## Standings, polls, power
- Standings by conference record (NCAA) / overall (WNBA), then W-L, then point differential.
- Power rating: SRS-style (margin capped at 25, 3-point home edge) blended with roster strength (5 games of prior).
- AP Top 25 every Monday: power + record bonus - 1.2 per loss.

## Tournaments
- Conference tournaments: top 16 by conference standing, bracket size next power of 2 with byes, neutral, one round a
  day. Champion = automatic bid.
- NCAA (68): automatic bids + at-large by power (teams under .500-2 skipped). First Four = last four at-large (two
  11-seed games) + four lowest automatic qualifiers (two 16-seed games). S-curve into four regions. Top-16 seeds host
  rounds 1-2 on campus (home games); later rounds neutral.
- WNBA playoffs: top 8 by record, 1-8 / 4-5 / 3-6 / 2-7; best-of-3 (1-1-1), best-of-5 (2-2-1), Finals best-of-7 (2-2-1-1-1).

Box scores are kept for the user's games, the NCAA tournament and the WNBA playoffs; other games keep each team's top scorer.
