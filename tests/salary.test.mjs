import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedBetween, formatMoney, payCycleAt, paydayInMonth, snapshotAt } from '../dist/shared/salary.js';

const settings = {
  currency: 'MYR',
  monthlySalary: 3_100,
  payday: 15,
  payoutTime: '12:00',
  startAt: '2025-04-15T04:00:00.000Z', // local noon in UTC+08
};

test('clamps a 31st payday to Februarys final day', () => {
  const date = paydayInMonth(2025, 1, { payday: 31, payoutTime: '09:30' });
  assert.equal(date.getFullYear(), 2025);
  assert.equal(date.getMonth(), 1);
  assert.equal(date.getDate(), 28);
  assert.equal(date.getHours(), 9);
  assert.equal(date.getMinutes(), 30);
});

test('the payday instant belongs to the new cycle', () => {
  const atPayday = new Date('2025-05-15T04:00:00.000Z');
  const cycle = payCycleAt(atPayday, settings);
  assert.equal(cycle.start.getTime(), atPayday.getTime());
  assert.equal(cycle.end.getDate(), 15);
  assert.equal(cycle.end.getMonth(), 5);
});

test('one complete salary period earns exactly one monthly salary', () => {
  const start = new Date('2025-04-15T04:00:00.000Z');
  const end = new Date('2025-05-15T04:00:00.000Z');
  assert.equal(earnedBetween(start, end, settings), 3_100);
});

test('total remains continuous after passing a payday', () => {
  const now = new Date('2025-05-30T04:00:00.000Z');
  const snapshot = snapshotAt(settings, now);
  assert.ok(snapshot.totalEarned >= 4_600 && snapshot.totalEarned < 4_700);
  assert.ok(snapshot.cycleEarned > 1_400 && snapshot.cycleEarned < 1_600);
  assert.equal(snapshot.nextPayday.getMonth(), 5);
  assert.equal(snapshot.nextPayday.getDate(), 15);
});

test('a future start reports zero until the clock begins', () => {
  const snapshot = snapshotAt({ ...settings, startAt: '2030-01-01T00:00:00.000Z' }, new Date('2029-12-31T00:00:00.000Z'));
  assert.equal(snapshot.totalEarned, 0);
  assert.equal(snapshot.cycleEarned, 0);
  assert.equal(snapshot.hasStarted, false);
});

test('formats TWD with the New Taiwan dollar symbol', () => {
  assert.match(formatMoney(12_345.67, 'TWD', 2), /NT\$12,345\.67/);
});
