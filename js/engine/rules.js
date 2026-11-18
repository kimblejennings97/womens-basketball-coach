// League rules + engine calibration constants. Rules follow the real books:
//  NCAA women: 4 x 10:00 quarters, 30-second shot clock (20 after an offensive rebound), team bonus (2 FTs) on the 5th
//  team foul of a quarter, 5 personal fouls to foul out, 5:00 overtimes (fouls carry over from the 4th quarter).
//  WNBA: 4 x 10:00 quarters, 24-second shot clock (14 after an offensive rebound), bonus on the 5th team foul of a
//  quarter or the 2nd team foul in its last 2:00, 6 fouls to foul out, 5:00 overtimes (bonus on the 4th OT team foul).
// `cal` holds the numbers the calibration harness tunes so an average team matches the league's real averages
// (docs/engine.md has the targets and the measured results).
export const RULES = {
  ncaa: {
    id: 'ncaa', name: 'NCAA', qLen: 600, quarters: 4, otLen: 300, shotClock: 30, orebClock: 20,
    foulOut: 5, bonusAt: 5, last2: false, otBonusAt: null, timeouts: 4,
    cal: {
      hcMean: 19.1, hcSd: 5.5, transP: { stl: 0.55, dreb: 0.14, make: 0.03 },
      tov: 0.19, stlShare: 0.53,
      mix: { rim: 0.33, post: 0.14, mid: 0.24, three: 0.25 },
      make: { rim: 0.485, post: 0.365, mid: 0.315, three: 0.318 },
      foul: { rim: 0.2, post: 0.15, mid: 0.058, three: 0.014 }, nsFoul: 0.1,
      blk: 0.12, oreb: 0.335, ast: { rim: 0.43, post: 0.27, mid: 0.41, three: 0.72 },
      ftBase: 0.47, ftPer: 0.024, ratingRef: 9,
    },
  },
  wnba: {
    id: 'wnba', name: 'WNBA', qLen: 600, quarters: 4, otLen: 300, shotClock: 24, orebClock: 14,
    foulOut: 6, bonusAt: 5, last2: true, otBonusAt: 4, timeouts: 4,
    cal: {
      hcMean: 16.8, hcSd: 4.3, transP: { stl: 0.58, dreb: 0.16, make: 0.03 },
      tov: 0.13, stlShare: 0.57,
      mix: { rim: 0.33, post: 0.13, mid: 0.25, three: 0.225 },
      make: { rim: 0.58, post: 0.43, mid: 0.39, three: 0.35 },
      foul: { rim: 0.2, post: 0.145, mid: 0.05, three: 0.014 }, nsFoul: 0.095,
      blk: 0.17, oreb: 0.255, ast: { rim: 0.5, post: 0.33, mid: 0.45, three: 0.74 },
      ftBase: 0.47, ftPer: 0.024, ratingRef: 14,
    },
  },
};

// Coach tactics. Multipliers act on the shot mix, turnovers, pace and assists.
export const OFFENSES = {
  motion:    { name: 'Motion',          desc: 'Balanced ball and player movement. Good shots for everyone, lots of assists.', mix: { rim: 1, post: 1, mid: 1, three: 1 }, ast: 1.12, tov: 1.0, pace: 0, usage: 0.7 },
  pnr:       { name: 'Pick and roll',   desc: 'Guards and screeners run ball screens. Lifts the ball handler and the roller.', mix: { rim: 1.12, post: 0.7, mid: 1.15, three: 1.05 }, ast: 1.0, tov: 1.02, pace: 0, usage: 1.0, hdl: 1.25 },
  post:      { name: 'Post offense',    desc: 'Play through the bigs on the block. Draws fouls, fewer threes.', mix: { rim: 1.1, post: 1.9, mid: 0.9, three: 0.78 }, ast: 0.95, tov: 1.0, pace: 1, usage: 1.0, big: 1.35 },
  fiveout:   { name: '5-out / 3-heavy', desc: 'Space the floor, drive and kick, launch threes.', mix: { rim: 1.12, post: 0.5, mid: 0.65, three: 1.42 }, ast: 1.06, tov: 1.0, pace: -0.5, usage: 0.85 },
  drive:     { name: 'Dribble drive',   desc: 'Attack the rim off the bounce. More fouls drawn, more turnovers.', mix: { rim: 1.45, post: 0.8, mid: 0.85, three: 1.0 }, ast: 0.92, tov: 1.06, pace: -1, usage: 1.15, foul: 1.15 },
  princeton: { name: 'Princeton',       desc: 'Patient backdoor cuts and passing. Slow pace, few turnovers.', mix: { rim: 1.15, post: 1.0, mid: 0.9, three: 1.1 }, ast: 1.22, tov: 0.9, pace: 3, usage: 0.6 },
};
export const PACES = { fast: { name: 'Push the pace', dt: -3, trans: 1.5, fat: 1.1 }, normal: { name: 'Normal', dt: 0, trans: 1, fat: 1 }, slow: { name: 'Grind it out', dt: 3.5, trans: 0.55, fat: 0.95 } };
export const DEFENSES = {
  man:     { name: 'Man-to-man',     desc: 'Each defender guards one player. Best defenders matter most.', mix: { rim: 1, post: 1, mid: 1, three: 1 }, tov: 1, oreb: 0, foul: 1 },
  z23:     { name: '2-3 zone',       desc: 'Packs the paint. Gives up threes and offensive rebounds.', mix: { rim: 0.84, post: 0.85, mid: 1.08, three: 1.2 }, tov: 0.97, oreb: 0.03, foul: 0.85, zone: 1 },
  z32:     { name: '3-2 zone',       desc: 'Takes away threes. Soft in the high post and on the block.', mix: { rim: 1.02, post: 1.2, mid: 1.08, three: 0.86 }, tov: 1, oreb: 0.025, foul: 0.9, zone: 1 },
  z131:    { name: '1-3-1 zone',     desc: 'Traps the wings. Forces turnovers but gives up corner threes and boards.', mix: { rim: 0.95, post: 0.95, mid: 0.95, three: 1.12 }, tov: 1.15, oreb: 0.04, foul: 0.95, zone: 1 },
  matchup: { name: 'Matchup zone',   desc: 'Zone that switches like man. Balanced, needs smart defenders.', mix: { rim: 0.93, post: 0.95, mid: 1.04, three: 1.06 }, tov: 1.04, oreb: 0.015, foul: 0.92, zone: 0.5, iq: 1 },
  box1:    { name: 'Box-and-one',    desc: 'Four in a zone, one shadows their best scorer.', mix: { rim: 0.9, post: 0.9, mid: 1.05, three: 1.12 }, tov: 1, oreb: 0.02, foul: 0.92, zone: 1, star: 0.62 },
};
export const LATE_FOUL = { auto: 'Coach decides', foul: 'Foul when trailing late', never: 'Never foul intentionally' };
export const defaultTactics = () => ({ off: 'motion', pace: 'normal', def: 'man', press: false, late: 'auto' });
