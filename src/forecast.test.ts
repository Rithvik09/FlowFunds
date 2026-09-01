import { describe, expect, it } from 'vitest'
import { forecastMonthEndSpend } from './forecast'

// April 2024: 30-day month. Using a fixed mid-month date keeps daysElapsed/
// daysRemaining deterministic across test runs regardless of when they execute.
const MID_APRIL = new Date(Date.UTC(2024, 3, 15)) // day 15 of 30 -> 15 remaining

describe('forecastMonthEndSpend', () => {
  it('projects under budget when the current daily rate stays under the limit', () => {
    const f = forecastMonthEndSpend(60, 150, MID_APRIL)
    // dailyRate = 60/15 = 4; projected = 60 + 4*15 = 120
    expect(f.projectedSpend).toBeCloseTo(120)
    expect(f.projectedRemaining).toBeCloseTo(30)
    expect(f.onPaceToExceed).toBe(false)
    expect(f.daysElapsed).toBe(15)
    expect(f.daysRemaining).toBe(15)
  })

  it('flags on-pace-to-exceed once the projection crosses the limit', () => {
    const f = forecastMonthEndSpend(90, 150, MID_APRIL)
    // dailyRate = 90/15 = 6; projected = 90 + 6*15 = 180 > 150
    expect(f.projectedSpend).toBeCloseTo(180)
    expect(f.projectedRemaining).toBeCloseTo(-30)
    expect(f.onPaceToExceed).toBe(true)
  })

  it('treats the boundary (projected spend exactly at the limit) as not exceeding', () => {
    const f = forecastMonthEndSpend(75, 150, MID_APRIL)
    // dailyRate = 5; projected = 75 + 5*15 = 150 === limit
    expect(f.projectedSpend).toBeCloseTo(150)
    expect(f.onPaceToExceed).toBe(false)
  })

  it('handles day 1 of the month without dividing by zero', () => {
    const day1 = new Date(Date.UTC(2024, 3, 1))
    const f = forecastMonthEndSpend(10, 100, day1)
    expect(f.daysElapsed).toBe(1)
    expect(f.daysRemaining).toBe(29)
    // dailyRate = 10/1 = 10; projected = 10 + 10*29 = 300
    expect(f.projectedSpend).toBeCloseTo(300)
    expect(f.onPaceToExceed).toBe(true)
  })

  it('handles zero spend so far as projecting zero, not NaN', () => {
    const f = forecastMonthEndSpend(0, 100, MID_APRIL)
    expect(f.projectedSpend).toBe(0)
    expect(f.onPaceToExceed).toBe(false)
  })

  it('correctly sizes a 28-day February', () => {
    const feb15 = new Date(Date.UTC(2023, 1, 15)) // 2023 is not a leap year
    const f = forecastMonthEndSpend(50, 100, feb15)
    expect(f.daysElapsed).toBe(15)
    expect(f.daysRemaining).toBe(13)
  })
})
