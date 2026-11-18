# Live game court animation (js/ui/court.js)

Pure presentation: reads the events each engine step returns (one possession) and plays them on a canvas. Never touches
the simulation or its rng. Shown above the play-by-play in the live viewer; "Court" checkbox in the live controls
(`G.user.court`, default on).

## Look (wrestling-coach style: team kits, venue in the home team's colours)
- Broadcast camera behind the near sideline, true perspective (`cam` in `size()`, fitted to the canvas; aspect 0.4).
- Wood floor with planks; paint and apron in the home team's colour (mixed with the wood); home logo at centre court
  (multiply blend, so white logo backgrounds vanish). Neutral sites (tournaments) get a navy NCAA-style neutral court.
- Lane width by league (NCAA 12 ft, WNBA 16 ft), 22'1.75" three-point arc with straight corners, restricted arc,
  free-throw circles, stanchions, glass backboards, rims with nets (net ripples on a make, rim flashes on a miss).
- Players: figures drawn ~1.5x life size so they read (neutral grey skin like the wrestlers, shorts, jersey with number,
  running legs/arms, arms up and a hop on the shot). Home in white with team-colour trim/numbers, visitors in team colour
  (a too-light colour falls back to the second colour / grey). Shadows; depth-sorted with the hoops and the ball.
- Ball: dribbled at the handler's side, passes, shot arcs (three 16 ft apex, layups 12), rim-outs, blocks, loose balls.
- Banners (team colour): TIP-OFF, THREE!, AND ONE!, LAYUP, SCORES, BLOCKED, STEAL, TURNOVER, SHOT CLOCK, FOUL,
  FREE THROWS 2/2, TIMEOUT, MEDIA TIMEOUT, SUBSTITUTION, END OF Qn, FINAL; CHAMPIONS! + confetti when the game decides
  a title (NCAA final; a WNBA Finals game won by the team with three wins).

## Scripts
`play(evs, state, ms)`: state = both on-court fives (position order), tactics, quarter, home roster, jersey numbers.
- Offence attacks the right basket when (home and first half) or (away and second half).
- Phases (fractions of the step): set up 0-.30 (players run to spots: base / 5-out / post / Princeton sets by the
  offensive style; man defenders between man and basket, zones from `ZONES` for 2-3 / 3-2 / 1-3-1), ball movement
  .30-.62 (1-3 passes ending with the assister then the shooter; pseudo-random from the event text, never the rng),
  action .62-.78 (shooter moves to the zone: rim drive, block for post, 13-16 ft mid, 23 ft arc; defender closes out),
  result .78-1 (flight, make / miss / block, rebound to the rebounder; others crash or get back).
- Turnovers: steal = pass picked off, stealer dribbles the other way; otherwise the ball goes out of bounds.
- Shooting fouls / bonus: the action takes the first 55%, then a free-throw scene (shooter at the line, lane spots,
  each attempt, last miss -> rebound). Side-out fouls: FOUL banner, ball stays.
- Dead-ball steps (timeouts, subs, quarter ends): banner; quarter / game ends walk players toward the bench; a period
  start lines up a tip / centre-court restart.

## Pacing
With the court on, a possession gets `SPEEDS_COURT` ms (slow 5.2 s, normal 3.0 s, fast 1.5 s; turbo snaps with no
animation) instead of `SPEEDS` (court off: 1.4 / 0.65 / 0.22 / 0.04 s). The animation runs ~94% of the slot. Pause /
speed changes / sim-to-end work as before (a new step finishes the running script instantly).

## Testing
- `courtsheet.html?n=8&skip=0&t=0.15,0.4,0.7,0.95[&big=1][&lg=wnba&h=&a=][&neutral=1]`: steps a real game and renders
  each possession at the given fractions as images; then plays the whole game through the script builder and counts
  NaN frames ("bad frames 0" expected).
- `uitest.html?shot=livecourt&ms=10000&speed=normal&team=<college team>`: starts a live game and lets it play; take a
  direct Edge screenshot of the page (not a DOM dump: canvas pixels don't survive). Headless virtual time doesn't run
  requestAnimationFrame reliably, so check motion in a real browser.
- Measured: full games fuzzed (UConn-South Carolina) with 0 bad frames; screenshots at 1280 and 1024 (iPad) widths.
- Not done: player-specific moves (dunks, crossovers), the box score viewer replaying old games, sound.
