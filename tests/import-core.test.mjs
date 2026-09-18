import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDelimiter, parseDelimited, detectColumns, detectKind,
  parseDate, parsePrice, parseTime, rowHash, analyseImport, clientDocFrom,
} from '../import-core.js';

const TODAY = '2026-09-18';
const SERVICES = [{ id: 's1', name: 'Corte + Brushing', duration: 45 }, { id: 's2', name: 'Coloração', duration: 90 }];

test('delimiter: Portuguese Excel uses ;', () => {
  assert.equal(detectDelimiter('Nome;Telemóvel;Email\nAna;912345678;a@b.pt'), ';');
  assert.equal(detectDelimiter('name,phone\nAna,912345678'), ',');
  assert.equal(detectDelimiter('name\tphone\nAna\t912'), '\t');
  assert.equal(detectDelimiter('"Silva, Ana";912345678'), ';', 'commas inside quotes do not count');
});

test('CSV parser handles quotes, escaped quotes, newlines and BOM', () => {
  const rows = parseDelimited('﻿Nome;Notas\n"Silva, Ana";"disse ""ok"""\nRui;linha\ncontinua');
  assert.deepEqual(rows[0], ['Nome', 'Notas']);
  assert.deepEqual(rows[1], ['Silva, Ana', 'disse "ok"']);
  assert.equal(rows.length, 4);
  assert.deepEqual(parseDelimited('a;b\n\n\nc;d').length, 2, 'blank lines dropped');
});

test('column detection, exact and partial, no double-assignment', () => {
  const m = detectColumns(['Nome Completo', 'Telemóvel', 'E-mail', 'Data de Nascimento']);
  assert.deepEqual(m, { name: 0, phone: 1, email: 2, birthday: 3 });
  assert.equal(detectKind(m), 'clients');
  const v = detectColumns(['Data', 'Hora', 'Cliente', 'Contacto', 'Serviço', 'Valor', 'Profissional']);
  assert.deepEqual(v, { name: 2, phone: 3, date: 0, time: 1, service: 4, price: 5, staff: 6 });
  assert.equal(detectKind(v), 'visits');
});

test('date, price and time parsing (Portuguese formats)', () => {
  assert.equal(parseDate('18/09/2026'), '2026-09-18');
  assert.equal(parseDate('2026-09-18'), '2026-09-18');
  assert.equal(parseDate('18.09.26'), '2026-09-18');
  assert.equal(parseDate('31/02/2026'), null, 'impossible date');
  assert.equal(parseDate(''), null);
  assert.equal(parsePrice('35,00 €'), 35);
  assert.equal(parsePrice('€1.234,50'), 1234.5);
  assert.equal(parsePrice('1,234.50'), 1234.5);
  assert.equal(parsePrice('abc'), null);
  assert.equal(parsePrice('0'), 0);
  assert.equal(parseTime('9h30'), '09:30');
  assert.equal(parseTime('14:05'), '14:05');
  assert.equal(parseTime('99:99'), null);
});

test('client list: validation, dedupe inside the file, matching existing clients', () => {
  const text = [
    'Nome;Telemóvel;Email;Aniversário',
    'Ana Silva;912 345 678;ANA@x.pt;04/03/1990',
    'Ana Silva;912345678;ana@x.pt;',            // same person again (same phone)
    'Rui Costa;913000111;rui@x.pt;',
    'Sem Contacto;;;',                           // no phone, but has a name → valid
    ';;;',                                       // nothing → dropped as blank line
    'Mau Telefone;12;nope;',                     // invalid phone + invalid email
  ].join('\n');
  const r = analyseImport({ text, today: TODAY, services: SERVICES, existingClients: [{ id: 'c1', phoneE164: '351913000111', email: 'rui@x.pt' }] });
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'clients');
  assert.equal(r.summary.total, 5);
  assert.equal(r.summary.invalid, 1);
  assert.equal(r.summary.duplicatesInFile, 1);
  assert.equal(r.summary.matchedExisting, 1, 'Rui already exists');
  assert.equal(r.summary.newClients, 2, 'Ana + Sem Contacto');
  assert.equal(r.rows[0].client.phoneE164, '351912345678');
  assert.equal(r.rows[0].client.email, 'ana@x.pt');
  assert.equal(r.rows[0].client.birthday, '1990-03-04');
  // the ';;;' line is dropped as blank, so the bad row is the 5th kept row
  assert.deepEqual(r.rows[4].errors, ['telemóvel inválido', 'email inválido']);
  assert.equal(r.rows[3].ok, true, 'a name with no contact is still importable');
});

test('visit history: dates, prices, service matching, stable ids', () => {
  const text = [
    'Data;Hora;Cliente;Telemóvel;Serviço;Valor;Profissional',
    '04/03/2026;10:00;Ana Silva;912345678;Corte + Brushing;35,00 €;Ana',
    '08/04/2026;11:30;Ana Silva;912345678;Coloração;45 €;Ana',
    '10/05/2026;09:00;Ana Silva;912345678;Tratamento Raro;20 €;Ana',
    '01/01/2030;10:00;Futuro;912000999;Corte + Brushing;35;Ana',
  ].join('\n');
  const r = analyseImport({ text, today: TODAY, services: SERVICES });
  assert.equal(r.kind, 'visits');
  assert.equal(r.summary.valid, 3);
  assert.equal(r.summary.invalid, 1, 'a visit in the future is not history');
  assert.deepEqual(r.rows[3].errors, ['data no futuro']);
  assert.equal(r.summary.revenue, 100);
  assert.deepEqual(r.summary.dateRange, { from: '2026-03-04', to: '2026-05-10' });
  assert.deepEqual(r.summary.unmatchedServices, ['Tratamento Raro']);
  assert.equal(r.rows[0].visit.serviceId, 's1');
  assert.equal(r.rows[0].visit.endMin - r.rows[0].visit.startMin, 45, 'duration from the catalogue');
  assert.equal(r.rows[2].visit.serviceId, '', 'unknown service keeps its name, no id');
  assert.equal(r.rows[2].visit.duration, 45, 'falls back to the default duration');
  // same file imported twice → same document ids, so nothing is duplicated
  const again = analyseImport({ text, today: TODAY, services: SERVICES });
  assert.equal(r.rows[0].docId, again.rows[0].docId);
  assert.notEqual(r.rows[0].docId, r.rows[1].docId);
  assert.match(r.rows[0].docId, /^imp_[0-9a-f]{8}$/);
});

test('rejects files it cannot use', () => {
  assert.equal(analyseImport({ text: '', today: TODAY }).error, 'ficheiro-vazio');
  assert.equal(analyseImport({ text: 'Cor;Tamanho\nazul;M', today: TODAY }).error, 'sem-nome-nem-telefone');
});

test('mapping can be corrected by hand', () => {
  const text = 'A;B;C\nAna Silva;912345678;a@b.pt';
  const auto = analyseImport({ text, today: TODAY });
  assert.equal(auto.ok, false, 'unrecognisable headers');
  const manual = analyseImport({ text, today: TODAY, mappingOverride: { name: 0, phone: 1, email: 2 } });
  assert.equal(manual.ok, true);
  assert.equal(manual.rows[0].client.phoneE164, '351912345678');
  assert.deepEqual(clientDocFrom(manual.rows[0]), { name: 'Ana Silva', phone: '912345678', phoneE164: '351912345678', email: 'a@b.pt', birthday: null, notes: '' });
});

test('hash is stable and order-sensitive', () => {
  assert.equal(rowHash(['a', 'b']), rowHash(['a', 'b']));
  assert.notEqual(rowHash(['a', 'b']), rowHash(['b', 'a']));
  assert.equal(rowHash(['A', 'B']), rowHash(['a', 'b']), 'case-insensitive');
});
