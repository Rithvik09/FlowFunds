// Backtests the budget-forecast nudge (src/forecast.ts) against synthetic spending
// data to answer one question honestly: if a user gets flagged mid-month as "on pace
// to exceed budget" and responds by cutting back, how much does that actually move
// their odds of ending the month under budget?
//
// This is a SIMULATION, not a measurement from real FlowFunds users — the app has no
// production users yet, so there is no live A/B data to report. Every assumption below
// is stated explicitly and can be re-run or challenged. Run with:
//   node scripts/backtest-budget-adherence.mjs
//
// The forecast math mirrors src/forecast.ts::forecastMonthEndSpend exactly (linear
// extrapolation of the daily rate observed through the checkpoint day). It's
// duplicated here in plain JS rather than imported so this script has no build step —
// forecast.test.ts is what guarantees the two stay in sync.
function forecastMonthEndSpend(spentSoFar, monthlyLimit, daysElapsed, daysInMonth) {
  const daysRemaining = daysInMonth - daysElapsed;
  const dailyRate = spentSoFar / daysElapsed;
  const projectedSpend = spentSoFar + dailyRate * daysRemaining;
  return { projectedSpend, onPaceToExceed: projectedSpend > monthlyLimit };
}

// --- Deterministic PRNG (mulberry32) so results are reproducible run to run. ---
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNormal(rng, mean, stddev) {
  // Box-Muller transform.
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stddev;
}

// --- Simulation parameters (stated explicitly; change these and re-run to sensitivity-check) ---
const MONTHLY_LIMIT = 400; // dollars, one budget category (e.g. "Dining")
const DAYS_IN_MONTH = 30;
const CHECKPOINT_DAY = 15; // when the forecast/nudge fires — halfway through the month
const APPETITE_MEAN = 400; // a user's underlying true monthly spending appetite for
const APPETITE_STDDEV = 80; // this category varies month to month (illness, travel, a slow month, etc.)
const DAILY_NOISE_STDDEV = 0.5; // log-space noise: how much day-to-day spending wobbles
// around the user's monthly appetite, spread evenly across the month. This decorrelates
// the first-half pace from the second-half pace somewhat — a real forecast is a signal,
// not a certainty, and the backtest should reflect that instead of being a tautology.
const NUDGE_RESPONSE_FACTOR = 0.7; // ASSUMPTION, not measured: a user who gets flagged
// as on-pace-to-exceed cuts their remaining-month spending in this category by 30%.
// This is a modeling choice, deliberately conservative (not "stops spending entirely"),
// meant to represent a realistic partial behavioral response to a warning — not a
// number pulled from any FlowFunds user data, because none exists yet.
const MONTHS_PER_SEED = 5000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // run multiple seeds to show the result
// isn't a lucky draw — report the mean and range across seeds, not a single run.

function simulateOneSeed(seed) {
  const rng = mulberry32(seed);
  let baselineOverCount = 0;
  let nudgeOverCount = 0;
  let flaggedCount = 0;
  let flaggedAndSavedCount = 0; // flagged, over at baseline, under after nudge

  for (let m = 0; m < MONTHS_PER_SEED; m++) {
    const appetite = Math.max(0, randNormal(rng, APPETITE_MEAN, APPETITE_STDDEV));
    const dailyMean = appetite / DAYS_IN_MONTH;

    const dailySpend = [];
    for (let d = 0; d < DAYS_IN_MONTH; d++) {
      const noiseFactor = Math.exp(randNormal(rng, 0, DAILY_NOISE_STDDEV) - (DAILY_NOISE_STDDEV * DAILY_NOISE_STDDEV) / 2);
      dailySpend.push(Math.max(0, dailyMean * noiseFactor));
    }

    const spentThroughCheckpoint = dailySpend.slice(0, CHECKPOINT_DAY).reduce((a, b) => a + b, 0);
    const actualRemaining = dailySpend.slice(CHECKPOINT_DAY).reduce((a, b) => a + b, 0);

    const baselineTotal = spentThroughCheckpoint + actualRemaining;
    const baselineOver = baselineTotal > MONTHLY_LIMIT;
    if (baselineOver) baselineOverCount++;

    const forecast = forecastMonthEndSpend(spentThroughCheckpoint, MONTHLY_LIMIT, CHECKPOINT_DAY, DAYS_IN_MONTH);
    const flagged = forecast.onPaceToExceed;
    if (flagged) flaggedCount++;

    const nudgeRemaining = flagged ? actualRemaining * NUDGE_RESPONSE_FACTOR : actualRemaining;
    const nudgeTotal = spentThroughCheckpoint + nudgeRemaining;
    const nudgeOver = nudgeTotal > MONTHLY_LIMIT;
    if (nudgeOver) nudgeOverCount++;

    if (flagged && baselineOver && !nudgeOver) flaggedAndSavedCount++;
  }

  const baselineAdherence = 1 - baselineOverCount / MONTHS_PER_SEED;
  const nudgeAdherence = 1 - nudgeOverCount / MONTHS_PER_SEED;
  const relativeImprovementPct = ((nudgeAdherence - baselineAdherence) / baselineAdherence) * 100;

  return {
    seed,
    baselineAdherence,
    nudgeAdherence,
    relativeImprovementPct,
    flaggedRate: flaggedCount / MONTHS_PER_SEED,
    flaggedAndSavedCount,
  };
}

const results = SEEDS.map(simulateOneSeed);

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const meanBaseline = mean(results.map((r) => r.baselineAdherence));
const meanNudge = mean(results.map((r) => r.nudgeAdherence));
const meanRelImprovement = mean(results.map((r) => r.relativeImprovementPct));
const minRelImprovement = Math.min(...results.map((r) => r.relativeImprovementPct));
const maxRelImprovement = Math.max(...results.map((r) => r.relativeImprovementPct));
const meanFlaggedRate = mean(results.map((r) => r.flaggedRate));

console.log('--- Per-seed results ---');
for (const r of results) {
  console.log(
    `seed ${r.seed}: baseline adherence ${(r.baselineAdherence * 100).toFixed(1)}%, ` +
      `with-nudge adherence ${(r.nudgeAdherence * 100).toFixed(1)}%, ` +
      `relative improvement ${r.relativeImprovementPct.toFixed(1)}%, ` +
      `flagged ${(r.flaggedRate * 100).toFixed(1)}% of months`,
  );
}

console.log('\n--- Summary across ' + SEEDS.length + ' seeds x ' + MONTHS_PER_SEED + ' simulated user-months each ---');
console.log(`Baseline budget adherence (no nudge):   ${(meanBaseline * 100).toFixed(1)}%`);
console.log(`With-nudge budget adherence:             ${(meanNudge * 100).toFixed(1)}%`);
console.log(`Mean relative improvement in adherence:  ${meanRelImprovement.toFixed(1)}%`);
console.log(`Range across seeds:                      ${minRelImprovement.toFixed(1)}% to ${maxRelImprovement.toFixed(1)}%`);
console.log(`Share of months flagged at checkpoint:    ${(meanFlaggedRate * 100).toFixed(1)}%`);
console.log(
  '\nAssumptions: monthly limit $' +
    MONTHLY_LIMIT +
    ', checkpoint day ' +
    CHECKPOINT_DAY +
    '/' +
    DAYS_IN_MONTH +
    ', nudge response factor ' +
    NUDGE_RESPONSE_FACTOR +
    ' (flagged users cut remaining-month spend by ' +
    ((1 - NUDGE_RESPONSE_FACTOR) * 100).toFixed(0) +
    '%). This is a synthetic backtest, not measured production data.',
);
