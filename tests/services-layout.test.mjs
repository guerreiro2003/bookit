import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseSegments, segmentsDuration, hasGap, layoutServices, busyAt,
  generateSlots, checkSlot, resolveDayWindow, minToTime, occupiedFromAgenda, MAX_SERVICES_PER_BOOKING,
} from '../booking-core.js';

const CORTE = { id: 'c', name: 'Corte', price: 18, duration: 30 };
const BRUSH = { id: 'b', name: 'Brushing', price: 18, duration: 30 };
// Colour: apply 20 · process 30 (staff free) · wash & finish 25  → 75 min in the chair, 45 min of work
const COR = { id: 'k', name: 'Coloração', price: 45, duration: 75, segments: [{ type: 'active', minutes: 20 }, { type: 'gap', minutes: 30 }, { type: 'active', minutes: 25 }] };

const SCHED = {
  monday: { open: '10:00', close: '19:00', closed: false },
  tuesday: { open: '10:00', close: '19:00', closed: false, breakStart: '13:00', breakEnd: '14:00' },
  wednesday: { open: '10:00', close: '19:00', closed: false },
  thursday: { open: '10:00', close: '19:00', closed: false },
  friday: { open: '10:00', close: '19:00', closed: false },
  saturday: { open: '10:00', close: '18:00', closed: false },
  sunday: { closed: true },
};
const MON = '2026-09-14', TUE = '2026-09-15';
const win = (d) => resolveDayWindow({ salonSchedule: SCHED, staff: null, dateStr: d });

test('a plain service is one active block', () => {
  assert.deepEqual(normaliseSegments(CORTE), [{ type: 'active', minutes: 30 }]);
  assert.equal(hasGap(CORTE), false);
  assert.equal(segmentsDuration(normaliseSegments(CORTE)), 30);
});

test('a service with a processing gap keeps the staff busy only on the active parts', () => {
  assert.equal(hasGap(COR), true);
  const l = layoutServices([COR]);
  assert.equal(l.span, 75, 'client is in the salon 75 minutes');
  assert.deepEqual(l.busy, [{ start: 0, end: 20 }, { start: 50, end: 75 }], 'staff free between 20 and 50');
  assert.equal(l.price, 45);
});

test('segments fall back to duration when malformed', () => {
  assert.deepEqual(normaliseSegments({ duration: 40, segments: [] }), [{ type: 'active', minutes: 40 }]);
  assert.deepEqual(normaliseSegments({ duration: 40, segments: [{ type: 'gap', minutes: 10 }] }), [{ type: 'active', minutes: 40 }], 'a gap-only service makes no sense');
  assert.deepEqual(normaliseSegments({ duration: 0 }), []);
});

test('several services in one visit: time and price add up, touching blocks merge', () => {
  const l = layoutServices([CORTE, BRUSH]);
  assert.equal(l.span, 60);
  assert.deepEqual(l.busy, [{ start: 0, end: 60 }], 'two back-to-back services are one busy block');
  assert.equal(l.price, 36);

  const l2 = layoutServices([COR, CORTE]);      // colour then cut
  assert.equal(l2.span, 105);
  assert.deepEqual(l2.busy, [{ start: 0, end: 20 }, { start: 50, end: 105 }]);
  assert.equal(l2.price, 63);
  assert.deepEqual(busyAt(600, l2), [{ start: 600, end: 620 }, { start: 650, end: 705 }]);
});

test('MAX_SERVICES_PER_BOOKING is the contract the security rules implement', () => {
  assert.equal(MAX_SERVICES_PER_BOOKING, 3);
});

test('THE POINT: another client fits inside the colour processing gap', () => {
  const w = win(MON);
  const colour = layoutServices([COR]);
  // Colour booked at 10:00 → staff busy 10:00-10:20 and 10:50-11:15
  const occupied = busyAt(600, colour);
  const cutSlots = generateSlots({ ...w, duration: 30, interval: 15, occupied }).map(minToTime);
  assert.ok(cutSlots.includes('10:20'), 'a 30-min cut fits exactly in the gap');
  assert.ok(!cutSlots.includes('10:00'));
  assert.ok(!cutSlots.includes('10:30'), 'would run past the gap into the finishing block');
  assert.ok(!cutSlots.includes('11:00'));
  assert.ok(cutSlots.includes('11:15'), 'right after the colour finishes');
});

test('a long service cannot hide inside a short gap', () => {
  const w = win(MON);
  const occupied = busyAt(600, layoutServices([COR]));
  const long = generateSlots({ ...w, duration: 45, interval: 5, occupied }).map(minToTime);
  assert.ok(!long.includes('10:20'), '45 min does not fit in a 30 min gap');
  assert.ok(long.includes('11:15'));
});

test('two colour appointments interleave instead of blocking each other', () => {
  const w = win(MON);
  const l = layoutServices([COR]);
  const first = busyAt(600, l);            // 10:00 → busy 10:00-10:20 and 10:50-11:15
  const slots = generateSlots({ ...w, span: l.span, busy: l.busy, interval: 15, occupied: first }).map(minToTime);
  // A second colour at 10:30: applies 10:30-10:50 (before the first is washed),
  // processes 10:50-11:20 (while the staff finishes the first), finishes 11:20-11:45.
  assert.ok(slots.includes('10:30'), 'second colour dovetails with the first');
  assert.equal(checkSlot({ window: w, span: l.span, busy: l.busy, start: 630, occupied: first }), null);
  // 10:20 would collide: its finishing block (11:10-11:35) hits the first wash (10:50-11:15)
  assert.equal(checkSlot({ window: w, span: l.span, busy: l.busy, start: 620, occupied: first }), 'slot-taken');
});

test('the whole visit must fit inside opening hours, gap included', () => {
  const w = win(MON); // closes 19:00 = 1140
  const l = layoutServices([COR]);
  assert.equal(checkSlot({ window: w, span: l.span, busy: l.busy, start: 1065, occupied: [] }), null, '17:45 + 75 = 19:00 exactly');
  assert.equal(checkSlot({ window: w, span: l.span, busy: l.busy, start: 1070, occupied: [] }), 'outside-hours');
});

test('a break blocks active work, but a processing gap may sit right on top of it', () => {
  const w = win(TUE); // lunch break 13:00-14:00 (780-840)
  const l = layoutServices([COR]);
  // 12:40 → work 12:40-13:00, processing 13:00-13:30, finish 13:30-13:55 → finishing lands in the break
  assert.equal(checkSlot({ window: w, span: l.span, busy: l.busy, start: 760, occupied: [] }), 'break');

  // A colour whose 60-minute processing exactly covers the lunch hour: the staff
  // member works 12:40-13:00, goes to lunch while it processes, finishes at 14:00.
  const lunchColour = layoutServices([{ ...COR, duration: 100, segments: [{ type: 'active', minutes: 20 }, { type: 'gap', minutes: 60 }, { type: 'active', minutes: 20 }] }]);
  assert.deepEqual(busyAt(760, lunchColour), [{ start: 760, end: 780 }, { start: 840, end: 860 }]);
  assert.equal(checkSlot({ window: w, span: lunchColour.span, busy: lunchColour.busy, start: 760, occupied: [] }), null,
    'processing covers the break exactly — this is a bookable slot the old engine would have refused');
});

test('reason codes still distinguish break from taken slot', () => {
  const w = win(TUE);
  assert.equal(checkSlot({ window: w, duration: 30, start: 13 * 60, occupied: [] }), 'break');
  assert.equal(checkSlot({ window: w, duration: 30, start: 600, occupied: [{ start: 610, end: 640 }] }), 'slot-taken');
  assert.equal(checkSlot({ window: w, duration: 30, start: 600, occupied: [] }), null);
});

test('agenda reads the by-booking shape and the legacy one', () => {
  const byBooking = { b1: { blocks: [{ start: 600, end: 620 }, { start: 650, end: 675 }] }, b2: { blocks: [{ start: 700, end: 730 }] } };
  assert.deepEqual(occupiedFromAgenda({ byBooking }), [{ start: 600, end: 620 }, { start: 650, end: 675 }, { start: 700, end: 730 }]);
  assert.deepEqual(occupiedFromAgenda({ byBooking }, 'b1'), [{ start: 700, end: 730 }]);
  const legacy = { intervals: [{ start: 600, end: 645, bookingId: 'x' }, { start: 700, end: 730, bookingId: 'y' }] };
  assert.deepEqual(occupiedFromAgenda(legacy, 'x'), [{ start: 700, end: 730 }]);
  assert.deepEqual(occupiedFromAgenda(null), []);
});
