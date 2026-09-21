/* Is the product actually working right now, for a real visitor?
 *
 *   node --import ./tests/_register.mjs scripts/healthcheck.mjs [salonId]
 *
 * Not a ping. A ping tells you the server answered; it does not tell you that
 * a client can book, which is the only thing that matters. This walks the same
 * road a visitor walks — unauthenticated, from outside — and also re-checks two
 * security properties that must never quietly come undone.
 *
 * Exits non-zero with a plain explanation on the first real failure, so a cron
 * can turn it into an alert. Writes nothing.
 */
import { db, auth, doc, getDoc, getDocs, collection, setDoc, signOut } from '../firebase.js';
import {
  loadSalon, loadBookingContext, computeAvailability, planActive,
  todayForSalon, addDaysStr, resolveDayWindow,
} from '../app.js';

const SALON = process.argv[2] || process.env.SALON_ID || 'demo';
const SITE = process.env.SITE_URL || 'https://bookit-51575.web.app';

const problems = [];
const notes = [];
const fail = (what, detail) => problems.push(`${what}${detail ? ` — ${detail}` : ''}`);
const ok = (what) => notes.push(`✓ ${what}`);

const started = Date.now();
await signOut(auth).catch(() => {});   // a visitor is not signed in

/* ── 1. the page a client lands on ─────────────────────────────────────── */
try {
  const r = await fetch(`${SITE}/index.html?salon=${encodeURIComponent(SALON)}`, { redirect: 'follow' });
  const html = await r.text();
  if (!r.ok) fail('A página de marcação não responde', `HTTP ${r.status}`);
  else if (!html.includes('id="servicesList"')) fail('A página de marcação respondeu mas veio sem o passo dos serviços');
  else ok(`página de marcação responde (${r.status})`);

  // A deploy that accidentally serves the repo would hand out tests and scripts.
  const leak = await fetch(`${SITE}/package.json`);
  if (leak.ok) fail('O site está a servir package.json', 'ficheiros de desenvolvimento expostos');
  else ok('ficheiros de desenvolvimento não são servidos');
} catch (e) {
  fail('Não foi possível chegar ao site', e.message);
}

/* ── 2. the salon is set up well enough to take a booking ──────────────── */
let salon = null, ctx = null;
try {
  salon = await loadSalon(SALON);
  if (!salon) fail(`O salão "${SALON}" não existe ou não é legível`);
  else {
    ok(`salão "${salon.name}" legível sem sessão`);
    if (!planActive(salon)) fail('A subscrição não está ativa', `plan=${salon.plan} — marcações online bloqueadas`);
    else ok('subscrição ativa');
    if (!salon.timezone) notes.push('· sem fuso horário definido (assume Europe/Lisbon)');
  }
} catch (e) {
  fail('Erro a ler o salão', e.code || e.message);
}

if (salon) {
  try {
    ctx = await loadBookingContext(SALON);
    const services = (await getDocs(collection(db, 'salons', SALON, 'services'))).docs
      .map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false);
    if (!ctx.schedule) fail('O salão não tem horário definido', 'ninguém consegue marcar');
    else ok('horário definido');
    if (!services.length) fail('O salão não tem serviços ativos', 'a página de marcação fica vazia');
    else ok(`${services.length} serviço(s) ativo(s)`);
    if (!ctx.staff.length) fail('O salão não tem colaboradores ativos', 'ninguém a quem marcar');
    else ok(`${ctx.staff.length} colaborador(es) ativo(s)`);

    /* ── 3. can someone actually book in the next two weeks? ── */
    if (ctx.schedule && services.length && ctx.staff.length) {
      const today = todayForSalon(salon);
      let found = null;
      for (let i = 0; i < 14 && !found; i++) {
        const date = addDaysStr(today, i);
        if (resolveDayWindow({ salonSchedule: ctx.schedule, staff: null, dateStr: date, closedDates: salon.closedDates || [] }).closed) continue;
        const { slots } = await computeAvailability({ salonId: SALON, salon, ctx, service: services[0], staff: null, dateStr: date });
        if (slots.length) found = { date, n: slots.length };
      }
      if (!found) fail('Não há um único horário livre nos próximos 14 dias', 'agenda cheia, horário mal definido, ou a agenda foi sabotada');
      else ok(`há horários livres (${found.n} em ${found.date})`);
    }
  } catch (e) {
    fail('Erro a calcular disponibilidade', e.code || e.message);
  }
}

/* ── 4. two security properties that must never quietly come undone ────── */
if (salon && ctx?.staff?.length) {
  // S-01: an agenda entry must shadow a real booking.
  const far = addDaysStr(todayForSalon(salon), 500);
  try {
    await setDoc(doc(db, 'salons', SALON, 'agenda', `${ctx.staff[0].id}__${far}`), {
      staffId: ctx.staff[0].id, date: far, viaBookingId: 'HEALTHCHECK-NAO-EXISTE',
      byBooking: { 'HEALTHCHECK-NAO-EXISTE': { blocks: [{ start: 0, end: 1440 }] } }, updatedAt: new Date(),
    });
    fail('REGRESSÃO DE SEGURANÇA: um anónimo consegue bloquear a agenda', 'ver S-01 na auditoria');
  } catch (e) {
    if (e.code === 'permission-denied') ok('agenda continua fechada a escritas fantasma');
    else fail('Verificação da agenda inconclusiva', e.code || e.message);
  }
}
// KI-003: the public salon document must not carry the owner's address.
if (salon) {
  const leaked = ['adminEmail', 'subscriptionStatus'].filter(f => salon[f] !== undefined);
  if (leaked.length) fail('REGRESSÃO DE PRIVACIDADE: o documento público do salão voltou a expor', leaked.join(', '));
  else ok('documento público do salão sem dados de administração');
}

/* ── report ────────────────────────────────────────────────────────────── */
const ms = Date.now() - started;
console.log(`\nHealthcheck — ${SALON} @ ${SITE} · ${ms} ms\n`);
for (const n of notes) console.log('  ' + n);
if (problems.length) {
  console.log('');
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\n${problems.length} problema(s).\n`);
  process.exit(1);
}
console.log('\nTudo bem.\n');
process.exit(0);
