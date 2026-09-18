/* ============================================================
   Book It — import-core.js
   Reading a salon's existing data out of a CSV/Excel export.
   Pure functions: no Firebase, no DOM.

   Two shapes are supported and detected automatically:
     · CLIENTES — nome, telemóvel, email, aniversário
     · VISITAS  — data, cliente, telemóvel, serviço, preço  (this is what powers
                  the cadence engine: without history there is nothing to say
                  about who disappeared)
   ============================================================ */
import { normalizePhone, isEmail, isValidDateStr, clampStr, timeToMin, minToTime } from './booking-core.js';

/* ── CSV ──────────────────────────────────────────────────── */
/** Portuguese Excel exports use ';'. Pick whichever separator dominates line 1. */
export function detectDelimiter(text) {
  const line = String(text || '').split(/\r?\n/).find(l => l.trim()) || '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ';';
}

/** RFC-4180-ish parser: quoted fields, escaped quotes, newlines inside quotes. */
export function parseDelimited(text, delimiter = null) {
  const src = String(text || '').replace(/^﻿/, '');   // strip BOM (Excel)
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === d) { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

/* ── Column detection ─────────────────────────────────────── */
const strip = (s) => String(s || '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

const FIELD_HINTS = {
  name:     ['nome', 'nome completo', 'cliente', 'name', 'client', 'customer', 'nome do cliente'],
  phone:    ['telemovel', 'telefone', 'contacto', 'contato', 'tlm', 'phone', 'mobile', 'nr telemovel', 'numero'],
  email:    ['email', 'e-mail', 'mail', 'correio'],
  birthday: ['aniversario', 'nascimento', 'data de nascimento', 'birthday', 'dob'],
  date:     ['data', 'date', 'dia', 'data da marcacao', 'data visita'],
  time:     ['hora', 'horas', 'time', 'hora inicio'],
  service:  ['servico', 'service', 'tratamento', 'servicos', 'descricao'],
  price:    ['preco', 'valor', 'price', 'total', 'montante', 'importancia'],
  staff:    ['colaborador', 'profissional', 'funcionario', 'staff', 'tecnico', 'cabeleireiro'],
  notes:    ['notas', 'observacoes', 'obs', 'notes', 'comentarios'],
};

/** Map each known field to a column index, by exact then partial header match. */
export function detectColumns(headers) {
  const h = headers.map(strip);
  const used = new Set();
  const mapping = {};
  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    let idx = h.findIndex((x, i) => !used.has(i) && hints.includes(x));
    if (idx === -1) idx = h.findIndex((x, i) => !used.has(i) && x && hints.some(hint => x.includes(hint)));
    if (idx !== -1) { mapping[field] = idx; used.add(idx); }
  }
  return mapping;
}

/** Visits need a date; anything else is treated as a client list. */
export const detectKind = (mapping) => (mapping.date != null ? 'visits' : 'clients');

/* ── Value parsing ────────────────────────────────────────── */
/** Accepts 2026-09-18, 18/09/2026, 18-09-2026, 18.09.26. Returns YYYY-MM-DD or null. */
export function parseDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) { const d = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`; return isValidDateStr(d) ? d : null; }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += y > 70 ? 1900 : 2000;
    const d = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    return isValidDateStr(d) ? d : null;
  }
  return null;
}
/** "35,00 €" · "€35.00" · "35" → 35 */
export function parsePrice(v) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
export function parseTime(v) {
  const s = String(v || '').trim();
  const m = /^(\d{1,2})[:h.](\d{2})/.exec(s);
  if (!m) return null;
  const t = `${String(m[1]).padStart(2, '0')}:${m[2]}`;
  return timeToMin(t) == null ? null : t;
}

/** Stable id so re-importing the same file updates instead of duplicating. */
export function rowHash(parts) {
  let h = 0x811c9dc5;
  for (const ch of parts.filter(Boolean).join('|').toLowerCase()) {
    h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* ── Analysis ─────────────────────────────────────────────── */
/**
 * Turn raw file text into rows ready to write, with every problem surfaced
 * BEFORE anything is saved.
 * @param {object} p
 * @param {string} p.text
 * @param {Array}  p.existingClients  [{ id, phoneE164, email }]
 * @param {Array}  p.services         [{ id, name }]
 * @param {string} p.today            salon-local YYYY-MM-DD
 * @param {object} [p.mappingOverride]
 */
export function analyseImport({ text, existingClients = [], services = [], today, mappingOverride = null, defaultDuration = 45 }) {
  const table = parseDelimited(text);
  if (!table.length) return { ok: false, error: 'ficheiro-vazio', rows: [], summary: null };
  const headers = table[0].map(h => String(h).trim());
  const mapping = mappingOverride || detectColumns(headers);
  const kind = detectKind(mapping);
  if (mapping.name == null && mapping.phone == null) return { ok: false, error: 'sem-nome-nem-telefone', headers, mapping, rows: [], summary: null };

  const byPhone = new Map(existingClients.filter(c => c.phoneE164).map(c => [c.phoneE164, c]));
  const byEmail = new Map(existingClients.filter(c => c.email).map(c => [String(c.email).toLowerCase(), c]));
  const svcByName = new Map(services.map(s => [strip(s.name), s]));

  const seen = new Map();          // key → first row index (duplicates inside the file)
  const rows = [];
  const unmatchedServices = new Set();

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const get = (f) => mapping[f] != null ? String(cells[mapping[f]] ?? '').trim() : '';
    const errors = [];

    const name = clampStr(get('name'), 80);
    const phoneRaw = get('phone');
    const phoneE164 = normalizePhone(phoneRaw);
    const email = get('email').toLowerCase();
    if (!name && !phoneE164) errors.push('sem nome nem telemóvel válido');
    if (phoneRaw && !phoneE164) errors.push('telemóvel inválido');
    if (email && !isEmail(email)) errors.push('email inválido');

    const key = phoneE164 || email || strip(name);
    const dupOf = seen.has(key) ? seen.get(key) : null;
    const existing = (phoneE164 && byPhone.get(phoneE164)) || (email && byEmail.get(email)) || null;

    const row = {
      line: i + 1,
      errors,
      key,
      duplicateOfLine: dupOf,
      existingClientId: existing?.id || null,
      client: {
        name: name || (phoneE164 ? 'Cliente' : ''),
        phone: phoneRaw, phoneE164,
        email: email && isEmail(email) ? email : '',
        birthday: parseDate(get('birthday')),
        notes: clampStr(get('notes'), 300),
      },
    };

    if (kind === 'visits') {
      const date = parseDate(get('date'));
      const time = parseTime(get('time')) || '10:00';
      const serviceName = clampStr(get('service'), 80) || 'Serviço';
      const price = parsePrice(get('price'));
      const svc = svcByName.get(strip(serviceName)) || null;
      if (!date) errors.push('data inválida');
      else if (date > today) errors.push('data no futuro');
      if (!svc && serviceName) unmatchedServices.add(serviceName);
      const duration = svc?.duration || defaultDuration;
      const startMin = timeToMin(time) ?? 600;
      row.visit = {
        date, time: minToTime(startMin), startMin, endMin: startMin + duration, duration,
        serviceName, serviceId: svc?.id || '', price: price ?? 0, hasPrice: price != null,
        staffName: clampStr(get('staff'), 80),
      };
      row.docId = date ? `imp_${rowHash([key, date, row.visit.time, strip(serviceName)])}` : null;
    }

    row.ok = errors.length === 0;
    if (row.ok && dupOf == null) seen.set(key, i + 1);
    rows.push(row);
  }

  const valid = rows.filter(r => r.ok);
  const uniqueNew = new Set(valid.filter(r => !r.existingClientId && r.duplicateOfLine == null).map(r => r.key));
  const summary = {
    kind,
    total: rows.length,
    valid: valid.length,
    invalid: rows.length - valid.length,
    // Only meaningful for a client list: in a visit history the same person
    // appearing many times is the point, not a duplicate.
    duplicatesInFile: kind === 'clients' ? valid.filter(r => r.duplicateOfLine != null).length : 0,
    repeatVisitors: kind === 'visits' ? valid.filter(r => r.duplicateOfLine != null).length : 0,
    matchedExisting: new Set(valid.filter(r => r.existingClientId).map(r => r.existingClientId)).size,
    newClients: uniqueNew.size,
    visits: kind === 'visits' ? valid.length : 0,
    withPrice: kind === 'visits' ? valid.filter(r => r.visit?.hasPrice).length : 0,
    revenue: kind === 'visits' ? Math.round(valid.reduce((a, r) => a + (r.visit?.price || 0), 0) * 100) / 100 : 0,
    dateRange: kind === 'visits' ? (() => {
      const ds = valid.map(r => r.visit?.date).filter(Boolean).sort();
      return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
    })() : null,
    unmatchedServices: [...unmatchedServices],
  };
  return { ok: true, headers, mapping, kind, rows, summary };
}

/** Fields that identify a person, for building/merging client documents. */
export function clientDocFrom(row) {
  return {
    name: row.client.name || 'Cliente',
    phone: row.client.phone || '', phoneE164: row.client.phoneE164 || null,
    email: row.client.email || '',
    birthday: row.client.birthday || null,
    notes: row.client.notes || '',
  };
}
