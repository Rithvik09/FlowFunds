// Monthly budget forecasting.
//
// Pure math, no I/O — deliberately kept separate from db.ts so it can be unit
// tested directly (see forecast.test.ts) and reused by the backtest script in
// scripts/backtest-budget-adherence.mjs without touching D1 or Hono.
//
// Method: linear extrapolation of the daily spend rate observed so far this
// month, projected across the remaining days in the month. This is the
// simplest defensible forecast — it doesn't model day-of-week effects,
// recurring bills landing later in the month, or category seasonality. The
// tradeoff is deliberate: a simple, explainable rule that's right often
// enough to be a useful early warning beats a fancier model whose behavior
// is hard to reason about. See README "How the forecast works" for more.

export interface BudgetForecast {
  /** Projected total spend for the category by month end, at the current pace. */
  projectedSpend: number;
  /** monthly_limit - projectedSpend. Negative means projected to go over. */
  projectedRemaining: number;
  /** True once the projection crosses the budget's monthly_limit. */
  onPaceToExceed: boolean;
  daysElapsed: number;
  daysRemaining: number;
}

export function forecastMonthEndSpend(spentSoFar: number, monthlyLimit: number, today: Date): BudgetForecast {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysElapsed = today.getUTCDate();
  const daysRemaining = daysInMonth - daysElapsed;

  const dailyRate = spentSoFar / daysElapsed;
  const projectedSpend = spentSoFar + dailyRate * daysRemaining;
  const projectedRemaining = monthlyLimit - projectedSpend;

  return {
    projectedSpend,
    projectedRemaining,
    onPaceToExceed: projectedSpend > monthlyLimit,
    daysElapsed,
    daysRemaining,
  };
}
