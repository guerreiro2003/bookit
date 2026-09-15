import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timeToMin, minToTime, isValidDateStr, addDaysStr, weekdayOf, nowInTimezone,
  overlaps, resolveDayWindow, generateSlots, checkSlot,
  canTransition, clientCanCancel, daysBetween,
  isEmail, isPhone, isSlug, validateBookingInput, applyDiscount,
  buildICS, googleCalendarUrl, agendaId, occupiedFromAgenda,
} from '../booking-core.js';

const SCHED = {
  monday:    { open: '10:00', close: '19:00', closed: false },
  tuesday:   { open: '10:00', close: '19:00', closed: false, breakStart: '13:00', breakEnd: '14:00' },
  wednesday: { open: '10:00', close: '19:00', closed: false },
  thursday:  { open: '10:00', close: '19:00', closed: false },
  friday:    { open: '10:00', close: '19:00', closed: false },
  saturday:  { open: '10:00', close: '18:00', closed: false },
  sunday:    { open: '', close: '', closed: true },
};
// 2026-09-14 = Monday, 2026-09-15 = Tuesday, 2026-09-20 = Sunday
const MON = '2026-09-14', TUE = '2026-09-15', SUN = '2026-09-20';

test('time conversions', () => {
  assert.equal(timeToMin('10:30'), 630);
  assert.equal(timeToMin('24:00'), null);
  assert.equal(timeToMin('9:00'), null);
  assert.equal(minToTime(630), '10:30');
  assert.equal(minToTime(0), '00:00');
});

test('date validation catches impossible dates', () => {
  assert.equal(isValidDateStr('2026-02-29'), false);
  assert.equal(isValidDateStr('2028-02-29'), true);
  assert.equal(isValidDateStr('2026-13-01'), false);
  assert.equal(isValidDateStr('2026-9-1'), false);
  assert.equal(addDaysStr('2026-12-31', 1), '2027-01-01');
  assert.equal(weekdayOf(SUN), 0);
  assert.equal(weekdayOf(MON), 1);
  assert.equal(daysBetween('2026-09-14', '2026-09-16'), 2);
});

test('nowInTimezone returns salon-local wall clock', () => {
  // 2026-07-01T22:30Z → Lisbon (UTC+1 in summer) = 23:30 same day; Tokyo = 07:30 next day
  const at = new Date('2026-07-01T22:30:00Z');
  const lis = nowInTimezone('Europe/Lisbon', at);
  assert.deepEqual(lis, { dateStr: '2026-07-01', minutes: 23 * 60 + 30 });
  const tok = nowInTimezone('Asia/Tokyo', at);
  assert.deepEqual(tok, { dateStr: '2026-07-02', minutes: 7 * 60 + 30 });
});

test('overlap is half-open', () => {
  assert.equal(overlaps({ start: 600, end: 690 }, { start: 690, end: 720 }), false);
  assert.equal(overlaps({ start: 600, end: 690 }, { start: 645, end: 675 }), true);
  assert.equal(overlaps({ start: 600, end: 690 }, { start: 500, end: 601 }), true);
});

test('resolveDayWindow: salon closed day, closed date, staff time-off, staff day off, override', () => {
  assert.equal(resolveDayWindow({ salonSchedule: SCHED, staff: null, dateStr: SUN }).closed, true);
  assert.equal(resolveDayWindow({ salonSchedule: SCHED, staff: null, dateStr: MON, closedDates: [MON] }).reason, 'salon-closed-date');
  const staffOff = { timeOff: [{ from: '2026-09-10', to: '2026-09-16' }] };
  assert.equal(resolveDayWindow({ salonSchedule: SCHED, staff: staffOff, dateStr: MON }).reason, 'staff-time-off');
  const staffDayOff = { schedule: { monday: { closed: true } } };
  assert.equal(resolveDayWindow({ salonSchedule: SCHED, staff: staffDayOff, dateStr: MON }).reason, 'staff-day-off');
  const staffLate = { schedule: { monday: { open: '14:00', close: '20:00', closed: false } } };
  const w = resolveDayWindow({ salonSchedule: SCHED, staff: staffLate, dateStr: MON });
  assert.deepEqual([w.open, w.close], [14 * 60, 20 * 60]);
  const tue = resolveDayWindow({ salonSchedule: SCHED, staff: null, dateStr: TUE });
  assert.deepEqual(tue.breaks, [{ start: 13 * 60, end: 14 * 60 }]);
});

test('generateSlots respects duration, grid, breaks and occupied intervals', () => {
  const w = resolveDayWindow({ salonSchedule: SCHED, staff: null, dateStr: TUE }); // 10-19 with 13-14 break
  const slots = generateSlots({ ...w, duration: 90, interval: 30 });
  const times = slots.map(minToTime);
  assert.ok(times.includes('10:00'));
  assert.ok(!times.includes('12:00'), '12:00+90 crosses the 13:00 break');
  assert.ok(times.includes('14:00'));
  assert.ok(!times.includes('18:00'), '18:00+90 exceeds close');
  assert.equal(times.at(-1), '17:30');

  // A 90-min booking at 10:00 must block a 45-min booking at 10:45 (the old exact-time bug)
  const occupied = [{ start: 600, end: 690 }];
  const s45 = generateSlots({ ...w, duration: 45, interval: 15, occupied }).map(minToTime);
  assert.ok(!s45.includes('10:45'));
  assert.ok(!s45.includes('10:00'));
  assert.ok(!s45.includes('09:45'));
  assert.ok(s45.includes('11:30'));
  // A 30-min booking at 11:15 that would end at 11:45 is fine
  assert.ok(generateSlots({ ...w, duration: 30, interval: 15, occupied }).map(minToTime).includes('11:30'));
});

test('lead time cutoff (notBefore) only removes earlier slots', () => {
  const w = resolveDayWindow({ salonSchedule: SCHED, staff: null, dateStr: MON });
  const s = generateSlots({ ...w, duration: 30, interval: 30, notBefore: 15 * 60 + 10 }).map(minToTime);
  assert.equal(s[0], '15:30');
});

test('checkSlot reason codes', () => {
  const w = resolveDayWindow({ salonSchedule: SCHED, staff: null, dateStr: TUE });
  assert.equal(checkSlot({ window: w, duration: 30, start: 600 }), null);
  assert.equal(checkSlot({ window: w, duration: 30, start: 9 * 60 }), 'outside-hours');
  assert.equal(checkSlot({ window: w, duration: 60, start: 18 * 60 + 30 }), 'outside-hours');
  assert.equal(checkSlot({ window: w, duration: 30, start: 13 * 60 }), 'break');
  assert.equal(checkSlot({ window: w, duration: 30, start: 600, occupied: [{ start: 615, end: 645 }] }), 'slot-taken');
  assert.equal(checkSlot({ window: w, duration: 30, start: 600, notBefore: 700 }), 'too-soon');
  assert.equal(checkSlot({ window: { closed: true, reason: 'salon-closed' }, duration: 30, start: 600 }), 'salon-closed');
});

test('state machine forbids invalid transitions', () => {
  assert.equal(canTransition('pending', 'confirmed'), true);
  assert.equal(canTransition('confirmed', 'completed'), true);
  assert.equal(canTransition('completed', 'cancelled'), false);
  assert.equal(canTransition('cancelled', 'completed'), false);
  assert.equal(canTransition('noshow', 'confirmed'), false);
  assert.equal(canTransition('cancelled', 'confirmed'), true, 'restore path');
  assert.equal(canTransition('bogus', 'confirmed'), false);
});

test('client cancellation policy', () => {
  const now = { dateStr: '2026-09-14', minutes: 10 * 60 };
  const b = { status: 'confirmed', date: '2026-09-15', time: '09:00' };
  assert.equal(clientCanCancel({ booking: b, cancellationHours: 24, now }).ok, false); // 23h ahead
  assert.equal(clientCanCancel({ booking: b, cancellationHours: 12, now }).ok, true);
  assert.equal(clientCanCancel({ booking: { ...b, status: 'completed' }, cancellationHours: 0, now }).ok, false);
});

test('validators', () => {
  assert.equal(isEmail('a@b.pt'), true);
  assert.equal(isEmail('a@b'), false);
  assert.equal(isPhone('912 345 678'), true);
  assert.equal(isPhone('12345'), false);
  assert.equal(isSlug('zen-organic'), true);
  assert.equal(isSlug('Zen'), false);
  const v = validateBookingInput({ name: 'A', email: 'x', phone: '1', date: '2026-02-30', time: '25:00' });
  assert.deepEqual(Object.keys(v.errors).sort(), ['date','email','name','phone','time']);
  assert.equal(validateBookingInput({ name: 'Ana Silva', email: 'ana@x.pt', phone: '912345678', date: MON, time: '10:00' }).ok, true);
});

test('pricing', () => {
  assert.equal(applyDiscount(35, 10), 31.5);
  assert.equal(applyDiscount(35, 0), 35);
  assert.equal(applyDiscount(35, 150), 0);
});

test('ics + google calendar', () => {
  const ics = buildICS({ uid: 'b1', title: 'Corte', dateStr: MON, time: '10:00', durationMin: 45, location: 'Rua X, 1' });
  assert.ok(ics.includes('DTSTART;TZID=Europe/Lisbon:20260914T100000'));
  assert.ok(ics.includes('DTEND;TZID=Europe/Lisbon:20260914T104500'));
  assert.ok(ics.includes('LOCATION:Rua X\\, 1'));
  const url = googleCalendarUrl({ title: 'Corte', dateStr: MON, time: '10:00', durationMin: 45 });
  assert.ok(url.includes('dates=20260914T100000%2F20260914T104500'));
});

test('agenda helpers', () => {
  assert.equal(agendaId('abc', MON), 'abc__2026-09-14');
  const occ = occupiedFromAgenda({ intervals: [{ start: 600, end: 645, bookingId: 'x' }, { start: 700, end: 730, bookingId: 'y' }] }, 'x');
  assert.deepEqual(occ, [{ start: 700, end: 730 }]);
});
