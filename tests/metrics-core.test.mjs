import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBaseline, availableMinutes, weekStartOf, pct } from '../metrics-core.js';

const SCHED = {
  monday: { open: '10:00', close: '19:00', closed: false }, tuesday: { open: '10:00', close: '19:00', closed: false, breakStart: '13:00', breakEnd: '14:00' },
  wednesday: { open: '10:00', close: '19:00', closed: false }, thursday: { open: '10:00', close: '19:00', closed: false },
  friday: { open: '10:00', close: '19:00', closed: false }, saturday: { open: '10:00', close: '18:00', closed: false }, sunday: { closed: true },
};
const STAFF = [{ id: 'a', name: 'Ana', active: true }, { id: 'b', name: 'Bruno', active: true, schedule: { monday: { closed: true } } }, { id: 'c', name: 'Inativo', active: false }];
// 2026-09-07 Mon … 2026-09-13 Sun
const B = (o) => ({ status: 'completed', paid: true, finalPrice: 35, startMin: 600, endMin: 645, staffId: 'a', staffName: 'Ana', serviceName: 'Corte', source: 'online', clientPhoneE164: '351911111111', ...o });

test('weekStartOf → ISO Monday', () => {
  assert.equal(weekStartOf('2026-09-13'), '2026-09-07');
  assert.equal(weekStartOf('2026-09-07'), '2026-09-07');
});

test('availableMinutes honours schedules, breaks, day-offs, inactive staff', () => {
  const { total, perStaff } = availableMinutes({ from: '2026-09-07', to: '2026-09-08', schedule: SCHED, staff: STAFF });
  // Mon: Ana 540, Bruno off; Tue: Ana 540-60=480, Bruno 480 → 1500
  assert.equal(total, 540 + 480 + 480);
  assert.equal(perStaff.get('a'), 1020);
  assert.equal(perStaff.has('c'), false);
});

test('baseline: no-show only over resolved past appointments; occupancy over past days; rates labelled', () => {
  const bookings = [
    B({ id: 1, date: '2026-09-07', status: 'completed', confirmedVia: 'link', confirmRequestedAt: 1 }),
    B({ id: 2, date: '2026-09-07', status: 'noshow', paid: false }),
    B({ id: 3, date: '2026-09-08', status: 'cancelled', paid: false, cancelledBy: 'client-link', cancelledAt: new Date('2026-09-08T09:00:00'), time: '10:00' }),
    B({ id: 4, date: '2026-09-08', status: 'completed', channel: 'ig', confirmedVia: 'staff', confirmRequestedAt: 1 }),
    B({ id: 5, date: '2026-09-10', status: 'confirmed', paid: false }),   // future (today = 09-09)
    B({ id: 6, date: '2026-09-08', status: 'pending', paid: false }),     // past & unresolved → flagged
  ];
  const m = computeBaseline({ bookings, from: '2026-09-07', to: '2026-09-13', today: '2026-09-09', schedule: SCHED, staff: STAFF });
  assert.equal(m.counts.total, 6);
  assert.equal(m.revenue.total, 70);
  assert.equal(m.revenue.avgTicket, 35);
  assert.equal(m.noShow.count, 1);
  assert.equal(m.noShow.resolved, 3);            // 2 completed + 1 noshow in the past
  assert.equal(pct(m.noShow.rate), '33%');
  assert.equal(m.noShow.unresolvedPast, 1);
  assert.equal(m.cancellations.count, 1);
  assert.equal(m.cancellations.late, 1);          // cancelled 1h before
  assert.equal(m.cancellations.byClient, 1);
  assert.equal(m.confirmation.requested, 2);
  assert.equal(m.confirmation.byLink, 1);
  // occupancy: past days 09-07..09-08 → available Ana 540+480, Bruno 0+480 = 1500; blocked = ids 1,2,4,6 = 4×45 = 180
  assert.equal(m.occupancy.availableMinutes, 1500);
  assert.equal(m.occupancy.bookedMinutes, 180);
  assert.equal(pct(m.occupancy.rate), '12%');
  assert.equal(m.byChannel.find(x => x.key === 'online:ig').bookings, 1);
  assert.equal(m.byWeek.length, 1);
  assert.equal(m.byWeek[0].key, '2026-09-07');
});

test('rebooking within 60 days, only for visits old enough to judge', () => {
  const bookings = [
    B({ id: 1, date: '2026-05-04', clientPhoneE164: '351911111111' }),
    B({ id: 2, date: '2026-05-04', clientPhoneE164: '351922222222' }),
    B({ id: 3, date: '2026-06-10', clientPhoneE164: '351911111111' }),   // Ana's client came back in 37 days
    B({ id: 4, date: '2026-09-01', clientPhoneE164: '351933333333' }),   // too recent to judge (today 09-09)
  ];
  const m = computeBaseline({ bookings, from: '2026-05-01', to: '2026-09-09', today: '2026-09-09' });
  assert.equal(m.rebooking.eligible, 3);   // ids 1,2,3 (≥60 days old)
  assert.equal(m.rebooking.rebooked, 1);   // only id 1 had a return within 60 days
});

test('empty period yields nulls, not NaN', () => {
  const m = computeBaseline({ bookings: [], from: '2026-09-07', to: '2026-09-13', today: '2026-09-20', schedule: SCHED, staff: STAFF });
  assert.equal(m.noShow.rate, null);
  assert.equal(m.revenue.avgTicket, null);
  assert.equal(m.occupancy.rate, 0);
  assert.equal(pct(null), '—');
});
