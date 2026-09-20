/* Cloud Functions — notificações por email (confirmação, cancelamento,
 * reagendamento, lembrete 24h). Escreve documentos na coleção `mail`, que a
 * extensão oficial "Trigger Email from Firestore" envia por SMTP.
 *
 * Requisitos externos: plano Blaze, extensão instalada e configurada
 * (SMTP + coleção "mail"), índice collection-group em bookings(date,status).
 * Ver README.md nesta pasta.
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });
const db = admin.firestore();

const APP_URL = process.env.APP_URL || 'https://bookit-51575.web.app';

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${d} de ${months[m - 1]} de ${y}`;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

async function salonOf(salonId) { const s = await db.doc(`salons/${salonId}`).get(); return s.exists ? { id: salonId, ...s.data() } : null; }

/** Queue one email. Idempotent per (booking, kind) thanks to the deterministic id. */
async function queueMail({ salon, booking, bookingId, kind, subject, intro }) {
  if (!booking.clientEmail || booking.anonymised) return;
  const manage = `${APP_URL}/account.html?salon=${encodeURIComponent(salon.id)}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#1a1814">
      <h2 style="font-weight:600">${esc(salon.name)}</h2>
      <p>${intro}</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#6b655b">Serviço</td><td><strong>${esc(booking.serviceName)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b655b">Data</td><td>${esc(fmtDate(booking.date))} às ${esc(booking.time)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b655b">Colaborador</td><td>${esc(booking.staffName || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b655b">Preço</td><td>${esc(booking.finalPrice ?? booking.servicePrice)}€</td></tr>
        ${salon.address ? `<tr><td style="padding:4px 12px 4px 0;color:#6b655b">Morada</td><td>${esc(salon.address)}</td></tr>` : ''}
      </table>
      <p style="font-size:13px;color:#6b655b">Para gerir a marcação: <a href="${manage}">${manage}</a>${salon.phone ? ` · ${esc(salon.phone)}` : ''}</p>
    </div>`;
  await db.doc(`mail/${bookingId}_${kind}_${Date.now()}`).set({
    to: booking.clientEmail,
    replyTo: salon.email || undefined,
    message: { subject: `${subject} — ${salon.name}`, html },
    meta: { salonId: salon.id, bookingId, kind, createdAt: admin.firestore.FieldValue.serverTimestamp() },
  });
}

exports.onBookingCreated = onDocumentCreated('salons/{salonId}/bookings/{bookingId}', async (event) => {
  const b = event.data.data(); const { salonId, bookingId } = event.params;
  // History brought in from the salon's old software is NOT news. Without this
  // guard, importing 2 000 past visits emails 2 000 real clients about
  // appointments they had two years ago.
  if (b.imported || b.source === 'import' || ['completed', 'cancelled', 'noshow'].includes(b.status)) return;
  const salon = await salonOf(salonId); if (!salon) return;
  await queueMail({ salon, booking: b, bookingId, kind: 'created',
    subject: b.status === 'confirmed' ? 'Marcação confirmada' : 'Marcação recebida',
    intro: b.status === 'confirmed' ? `Olá ${esc(b.clientName)}, a tua marcação está confirmada.` : `Olá ${esc(b.clientName)}, recebemos a tua marcação. Vais receber a confirmação do salão em breve.` });
});

exports.onBookingUpdated = onDocumentUpdated('salons/{salonId}/bookings/{bookingId}', async (event) => {
  const before = event.data.before.data(), after = event.data.after.data();
  const { salonId, bookingId } = event.params;
  if (after.imported || after.source === 'import') return;   // re-importing history is not news either
  const salon = await salonOf(salonId); if (!salon) return;
  if (before.status !== 'confirmed' && after.status === 'confirmed')
    return queueMail({ salon, booking: after, bookingId, kind: 'confirmed', subject: 'Marcação confirmada', intro: `Olá ${esc(after.clientName)}, a tua marcação foi confirmada pelo salão.` });
  if (before.status !== 'cancelled' && after.status === 'cancelled')
    return queueMail({ salon, booking: after, bookingId, kind: 'cancelled', subject: 'Marcação cancelada', intro: `Olá ${esc(after.clientName)}, a tua marcação foi cancelada${after.cancelledBy === 'client' ? ' a teu pedido' : ' pelo salão'}.` });
  if ((before.date !== after.date || before.time !== after.time || before.staffId !== after.staffId) && ['pending', 'confirmed'].includes(after.status))
    return queueMail({ salon, booking: after, bookingId, kind: 'rescheduled', subject: 'Marcação reagendada', intro: `Olá ${esc(after.clientName)}, a tua marcação foi reagendada. Novos detalhes:` });
});

/** Every hour: remind clients of tomorrow's appointments (salon-local date). */
exports.reminders = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Europe/Lisbon' }, async () => {
  const salons = await db.collection('salons').get();
  for (const s of salons.docs) {
    const salon = { id: s.id, ...s.data() };
    const tz = salon.timezone || 'Europe/Lisbon';
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + 86400000));
    const g = (t) => parts.find(p => p.type === t).value;
    const tomorrow = `${g('year')}-${g('month')}-${g('day')}`;
    const snap = await db.collection(`salons/${salon.id}/bookings`).where('date', '==', tomorrow).where('status', 'in', ['pending', 'confirmed']).get();
    for (const d of snap.docs) {
      const b = d.data(); if (b.reminderSentAt) continue;
      await queueMail({ salon, booking: b, bookingId: d.id, kind: 'reminder', subject: 'Lembrete: marcação amanhã', intro: `Olá ${esc(b.clientName)}, lembramos a tua marcação de amanhã.` });
      await d.ref.update({ reminderSentAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  }
});
