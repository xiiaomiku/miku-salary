/**
 * The authoritative salary-clock algorithm used by the Electron app on both
 * Windows and macOS. The WidgetKit target mirrors this documented algorithm
 * because it must run inside Apple's native widget process.
 */
export type CurrencyCode = 'MYR' | 'TWD';

export interface SalarySettings {
  currency: CurrencyCode;
  monthlySalary: number;
  payday: number;
  payoutTime: string; // HH:mm, local time
  startAt: string; // ISO 8601 instant
}

export interface PayCycle {
  start: Date;
  end: Date;
}

export interface SalarySnapshot {
  now: Date;
  cycle: PayCycle;
  totalEarned: number;
  cycleEarned: number;
  cycleProgress: number;
  perSecond: number;
  perMinute: number;
  perHour: number;
  nextPayday: Date;
  timeToNextPaydayMs: number;
  hasStarted: boolean;
}

export const WIDGET_GROUP_ID = 'group.com.mikusalary.app';

export const defaultSettings: SalarySettings = {
  currency: 'MYR',
  monthlySalary: 5000,
  payday: 28,
  payoutTime: '09:00',
  startAt: new Date().toISOString(),
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseClock(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('发薪时间必须为 HH:mm。');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('发薪时间无效。');
  return { hour, minute };
}

/** Returns the actual local payday, clamping 29–31 to the last day of short months. */
export function paydayInMonth(year: number, monthIndex: number, settings: Pick<SalarySettings, 'payday' | 'payoutTime'>): Date {
  const { hour, minute } = parseClock(settings.payoutTime);
  return new Date(year, monthIndex, Math.min(settings.payday, daysInMonth(year, monthIndex)), hour, minute, 0, 0);
}

/** Finds the pay period containing `at`, with the payday instant belonging to the new period. */
export function payCycleAt(at: Date, settings: Pick<SalarySettings, 'payday' | 'payoutTime'>): PayCycle {
  const thisMonthPayday = paydayInMonth(at.getFullYear(), at.getMonth(), settings);
  if (at.getTime() < thisMonthPayday.getTime()) {
    return {
      start: paydayInMonth(at.getFullYear(), at.getMonth() - 1, settings),
      end: thisMonthPayday,
    };
  }
  return {
    start: thisMonthPayday,
    end: paydayInMonth(at.getFullYear(), at.getMonth() + 1, settings),
  };
}

export function validateSettings(candidate: SalarySettings): SalarySettings {
  const currency: CurrencyCode = candidate.currency === 'TWD' ? 'TWD' : 'MYR';
  const monthlySalary = Number(candidate.monthlySalary);
  const payday = Number(candidate.payday);
  const startAt = new Date(candidate.startAt);
  if (!Number.isFinite(monthlySalary) || monthlySalary < 0 || monthlySalary > 10_000_000) {
    throw new Error('月薪必须介于 RM 0 和 RM 10,000,000 之间。');
  }
  if (!Number.isInteger(payday) || payday < 1 || payday > 31) {
    throw new Error('发薪日必须是 1 至 31。');
  }
  parseClock(candidate.payoutTime);
  if (Number.isNaN(startAt.getTime())) throw new Error('开始计算时间无效。');
  return { currency, monthlySalary, payday, payoutTime: candidate.payoutTime, startAt: startAt.toISOString() };
}

/**
 * Adds each elapsed slice at that period's actual duration. This deliberately
 * avoids assuming all months have 30 days, and makes the total continuous at
 * each payday rather than resetting it.
 */
export function earnedBetween(start: Date, end: Date, settings: SalarySettings): number {
  if (end.getTime() <= start.getTime() || settings.monthlySalary === 0) return 0;
  let cursor = start;
  let total = 0;
  // A sanity cap only protects corrupt timestamps; 200 years is far beyond a practical setting.
  for (let count = 0; cursor.getTime() < end.getTime() && count < 2_500; count += 1) {
    const cycle = payCycleAt(cursor, settings);
    const sliceEnd = cycle.end.getTime() < end.getTime() ? cycle.end : end;
    const cycleDuration = cycle.end.getTime() - cycle.start.getTime();
    total += settings.monthlySalary * ((sliceEnd.getTime() - cursor.getTime()) / cycleDuration);
    cursor = sliceEnd;
  }
  return total;
}

export function snapshotAt(settingsInput: SalarySettings, nowInput = new Date()): SalarySnapshot {
  const settings = validateSettings(settingsInput);
  const now = new Date(nowInput);
  const startAt = new Date(settings.startAt);
  const cycle = payCycleAt(now, settings);
  const hasStarted = now.getTime() >= startAt.getTime();
  const elapsedCycleStart = new Date(Math.max(startAt.getTime(), cycle.start.getTime()));
  const cycleDurationMs = cycle.end.getTime() - cycle.start.getTime();
  const cycleEarned = hasStarted
    ? settings.monthlySalary * Math.max(0, Math.min(1, (now.getTime() - elapsedCycleStart.getTime()) / cycleDurationMs))
    : 0;
  const perSecond = settings.monthlySalary / (cycleDurationMs / 1000);
  return {
    now,
    cycle,
    totalEarned: hasStarted ? earnedBetween(startAt, now, settings) : 0,
    cycleEarned,
    cycleProgress: Math.max(0, Math.min(1, (now.getTime() - cycle.start.getTime()) / cycleDurationMs)),
    perSecond,
    perMinute: perSecond * 60,
    perHour: perSecond * 3600,
    nextPayday: cycle.end,
    timeToNextPaydayMs: Math.max(0, cycle.end.getTime() - now.getTime()),
    hasStarted,
  };
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  return `${minutes}分钟`;
}

export function formatMoney(value: number, currency: CurrencyCode, fractionDigits = 2): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (currency === 'TWD') {
    const amount = new Intl.NumberFormat('zh-TW', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(safeValue);
    return `NT$${amount}`;
  }
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    currencyDisplay: 'symbol',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(safeValue);
}

/** Backward-compatible helper retained for integrations that imported the original formatter. */
export function formatMyr(value: number, fractionDigits = 2): string {
  return formatMoney(value, 'MYR', fractionDigits);
}

export function localDateTimeInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isoFromLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('开始计算时间无效。');
  return date.toISOString();
}

export const CALCULATION_NOTE = `每个发薪周期按月薪和实际周期秒数等比例累积；短月份会将 29–31 日自动视为当月最后一天。`;
