# Calculation contract

`src/shared/salary.ts` is the single calculation core for the Windows and macOS desktop applications. The native WidgetKit extension mirrors this contract because WidgetKit executes inside a Swift-only extension process.

For a pay day `D` and local pay time `T`, a period is `[D/T in one month, D/T in the following month)`. If the chosen day does not exist, the last local calendar day is used. The paycheck moment belongs to the new period.

For every elapsed portion of a period, earned value is:

`monthly salary × elapsed seconds / actual seconds in that period`

The accumulated total sums those portions from `startAt` to now. It therefore never resets at payday. The current-period amount is clamped at the later of `startAt` and that period's start.

Currency selection (`MYR` or `TWD`) changes formatting only. It does not perform exchange-rate conversion and does not alter the calendar calculation.

The daily salary rate is `monthly salary × 86,400 seconds / actual seconds in the current pay period`. Hourly, minute and second rates use the same denominator.

The TypeScript tests under `tests/` cover the important boundaries. Keep `native/macos-widget/SalaryClockWidget/SalaryClockWidget.swift` in lockstep with any future changes to this contract.
