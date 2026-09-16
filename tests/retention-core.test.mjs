import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientKeyOf, median, buildClientProfiles, reactivationCandidates, retentionSummary,
  explain, reactivationMessage, monthLabelPT, RISK, RETENTION_DEFAULTS,
} from '../retention-core.js';

const TODAY = '2026-09-16';
const B = (o) => ({ status: 'completed', paid: true, finalPrice: 35, serviceName: 'Corte', staffId: 'a', staffName: 'Ana', clientName: 'Ana Silva', clientPhoneE164: '351911111111', ...o });
const days = (n) => { const d = new Date(Date.parse(TODAY + 'T12:00:00Z') - n * 86400000); return d.toISOString().slice(0, 10); };

test('clientKeyOf is phone-first, so guest and account bookings are the same person', () => {
  assert.equal(clientKeyOf({ clientId: 'u1', clientPhoneE164: '351911111111' }), '351911111111');
  assert.equal(clientKeyOf({ clientPhone: '912 345 678' }), '351912345678');
  assert.equal(clientKeyOf({ clientId: 'u1' }), 'u1');
  assert.equal(clientKeyOf({ clientEmail: 'A@B.PT' }), 'a@b.pt');
  assert.equal(clientKeyOf({}), null);
});

test('same human booking as guest and as account holder is ONE profile', () => {
  const bookings = [
    { status: 'completed', paid: true, finalPrice: 30, date: '2026-06-01', serviceName: 'Corte', clientName: 'Rui', clientPhoneE164: '351913000111', clientId: null },
    { status: 'completed', paid: true, finalPrice: 30, date: '2026-07-06', serviceName: 'Corte', clientName: 'Rui', clientPhoneE164: '351913000111', clientId: 'acct-1' },
  ];
  const { profiles } = buildClientProfiles({ bookings, today: TODAY });
  assert.equal(profiles.length, 1, 'must not split into two people');
  assert.equal(profiles[0].visits, 2);
  assert.equal(profiles[0].cadenceDays, 35);
});

test('median', () => {
  assert.equal(median([30, 35, 40]), 35);
  assert.equal(median([30, 40]), 35);
  assert.equal(median([]), null);
});

test('cadence from the client\'s own rhythm; overdue drives the status', () => {
  const bookings = [
    B({ date: days(140) }), B({ date: days(105) }), B({ date: days(70) }),   // every 35 days
  ];
  const { profiles } = buildClientProfiles({ bookings, today: TODAY });
  const p = profiles[0];
  assert.equal(p.visits, 3);
  assert.equal(p.cadenceDays, 35);
  assert.equal(p.cadenceSource, 'own');
  assert.equal(p.daysSince, 70);
  assert.equal(p.overdueRatio, 2);
  assert.equal(p.status, RISK.AT_RISK);       // 2× ≥ 1.25 but < 2.5
  assert.equal(p.expectedNext, days(35));
  assert.equal(p.spent12m, 105);
  assert.equal(p.avgTicket, 35);
});

test('lost, healthy, inactive and scheduled states', () => {
  const mk = (key, lastDays, extra = {}) => [
    B({ clientPhoneE164: key, date: days(lastDays + 30) }),
    B({ clientPhoneE164: key, date: days(lastDays), ...extra }),
  ];
  const bookings = [
    ...mk('351900000001', 20),   // cadence 30, 20 days → healthy
    ...mk('351900000002', 45),   // 1.5× → at risk
    ...mk('351900000003', 100),  // 3.3× → lost
    ...mk('351900000004', 400),  // beyond a year → inactive
    ...mk('351900000005', 100),  // lost BUT has a future booking
    B({ clientPhoneE164: '351900000005', date: '2026-10-01', status: 'confirmed', paid: false }),
  ];
  const { profiles } = buildClientProfiles({ bookings, today: TODAY });
  const by = (k) => profiles.find(p => p.key === k);
  assert.equal(by('351900000001').status, RISK.HEALTHY);
  assert.equal(by('351900000002').status, RISK.AT_RISK);
  assert.equal(by('351900000003').status, RISK.LOST);
  assert.equal(by('351900000004').status, RISK.INACTIVE);
  assert.equal(by('351900000005').status, RISK.SCHEDULED, 'never chase someone who already has an appointment');
  assert.equal(by('351900000005').upcomingDate, '2026-10-01');
});

test('single-visit clients fall back to the service, then the salon rhythm', () => {
  // 5 clients doing "Coloração" every 60 days → service cadence = 60
  const history = [];
  for (let i = 1; i <= 5; i++) {
    const k = `35192000000${i}`;
    history.push(B({ clientPhoneE164: k, serviceName: 'Coloração', date: days(200) }));
    history.push(B({ clientPhoneE164: k, serviceName: 'Coloração', date: days(140) }));
  }
  const solo = B({ clientPhoneE164: '351999999999', serviceName: 'Coloração', date: days(90), clientName: 'Novo Cliente' });
  const { profiles, salonCadenceDays } = buildClientProfiles({ bookings: [...history, solo], today: TODAY });
  const p = profiles.find(x => x.key === '351999999999');
  assert.equal(p.cadenceSource, 'service');
  assert.equal(p.cadenceDays, 60);
  assert.equal(p.status, RISK.AT_RISK);   // 90 / 60 = 1.5
  assert.equal(salonCadenceDays, 60);

  // A service nobody repeats → falls back to the salon rhythm
  const odd = B({ clientPhoneE164: '351988888888', serviceName: 'Serviço Raro', date: days(200) });
  const r2 = buildClientProfiles({ bookings: [...history, odd], today: TODAY });
  const p2 = r2.profiles.find(x => x.key === '351988888888');
  assert.equal(p2.cadenceSource, 'salon');
  assert.equal(p2.cadenceDays, 60);
});

test('cadence is clamped and ignores absurd gaps', () => {
  const bookings = [B({ date: days(400) }), B({ date: days(398) }), B({ date: days(396) })]; // 2-day gaps
  const { profiles } = buildClientProfiles({ bookings, today: TODAY });
  assert.equal(profiles[0].cadenceDays, RETENTION_DEFAULTS.minCadenceDays);
});

test('cooldown suppresses recently contacted clients; dismissal lasts longer', () => {
  const bookings = [B({ date: days(140) }), B({ date: days(105) }), B({ date: days(70) })];
  const ms = (n) => Date.parse(TODAY + 'T12:00:00Z') - n * 86400000;
  const fresh = buildClientProfiles({ bookings, today: TODAY, reactivations: [{ clientKey: '351911111111', kind: 'sent', sentAt: new Date(ms(5)).toISOString() }] });
  assert.equal(fresh.profiles[0].suppressed, true);
  assert.equal(fresh.profiles[0].daysSinceContact, 5);
  const old = buildClientProfiles({ bookings, today: TODAY, reactivations: [{ clientKey: '351911111111', kind: 'sent', sentAt: new Date(ms(45)).toISOString() }] });
  assert.equal(old.profiles[0].suppressed, false);
  const dismissed = buildClientProfiles({ bookings, today: TODAY, reactivations: [{ clientKey: '351911111111', kind: 'dismissed', sentAt: new Date(ms(45)).toISOString() }] });
  assert.equal(dismissed.profiles[0].suppressed, true, 'dismissal holds for 180 days');
});

test('candidates: only actionable ones, richest first', () => {
  // cadence 60 days, last visit 120 days ago → 2× overdue → at risk
  const bookings = [
    B({ clientPhoneE164: '351931000001', clientName: 'Pouco Valor', date: days(180) }), B({ clientPhoneE164: '351931000001', clientName: 'Pouco Valor', date: days(120), finalPrice: 15 }),
    B({ clientPhoneE164: '351931000002', clientName: 'Muito Valor', date: days(180), finalPrice: 90 }), B({ clientPhoneE164: '351931000002', clientName: 'Muito Valor', date: days(120), finalPrice: 90 }),
    B({ clientPhoneE164: null, clientPhone: null, clientEmail: 'sem@fone.pt', clientName: 'Sem Telefone', date: days(180) }), B({ clientPhoneE164: null, clientPhone: null, clientEmail: 'sem@fone.pt', clientName: 'Sem Telefone', date: days(120) }),
  ];
  const { profiles } = buildClientProfiles({ bookings, today: TODAY });
  const list = reactivationCandidates(profiles);
  assert.equal(list.length, 2, 'clients without a phone are not actionable by WhatsApp');
  assert.equal(list[0].name, 'Muito Valor');
  const s = retentionSummary(profiles);
  assert.equal(s.atRisk + s.lost, 3);
  assert.equal(s.contactable, 2);
});

test('explanations and message read like a person wrote them', () => {
  const bookings = [B({ date: days(140) }), B({ date: days(105) }), B({ date: days(70) })];
  const { profiles } = buildClientProfiles({ bookings, today: TODAY });
  const p = profiles[0];
  assert.equal(explain(p), 'Vinha a cada 5 semanas; já passaram 10 semanas desde julho.');
  const msg = reactivationMessage({ profile: p, salonName: 'Zen Organic', link: 'https://x/?rt=1' });
  assert.ok(msg.startsWith('Olá Ana!'));
  assert.ok(msg.includes('Zen Organic') && msg.includes('desde julho') && msg.includes('Corte') && msg.includes('https://x/?rt=1'));
  assert.equal(monthLabelPT('2026-03-04'), 'março');
});

test('no-show count and guests without account are handled', () => {
  const bookings = [
    B({ clientId: null, clientPhoneE164: '351944000001', date: days(90) }),
    B({ clientId: null, clientPhoneE164: '351944000001', date: days(30), status: 'noshow', paid: false }),
  ];
  const { profiles } = buildClientProfiles({ bookings, today: TODAY });
  assert.equal(profiles[0].visits, 1);
  assert.equal(profiles[0].noShows, 1);
  assert.equal(profiles[0].lastVisit, days(90));
});
