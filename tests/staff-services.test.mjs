import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffCanDo, staffFor } from '../booking-core.js';

const ANA  = { id: 'ana',  name: 'Ana',  serviceIds: ['corte', 'cor', 'brushing'] };
const RUI  = { id: 'rui',  name: 'Rui',  serviceIds: ['corte'] };
const TODA = { id: 'toda', name: 'Toda' };                    // no list at all
const VAZIA = { id: 'vazia', name: 'Vazia', serviceIds: [] }; // explicit empty list

test('no list means the person does everything', () => {
  assert.equal(staffCanDo(TODA, ['corte']), true);
  assert.equal(staffCanDo(TODA, ['cor', 'tratamento-raro']), true);
  assert.equal(staffCanDo(VAZIA, ['o-que-for']), true, 'an empty list reads the same as no list');
  assert.equal(staffCanDo(TODA, []), true);
});

test('a restricted person only does what is on their list', () => {
  assert.equal(staffCanDo(RUI, ['corte']), true);
  assert.equal(staffCanDo(RUI, ['cor']), false);
  assert.equal(staffCanDo(ANA, ['corte', 'cor']), true);
});

test('a combined visit needs every service, not just one', () => {
  assert.equal(staffCanDo(RUI, ['corte', 'cor']), false, 'Rui does the cut but not the colour');
  assert.equal(staffCanDo(ANA, ['corte', 'cor', 'brushing']), true);
  assert.equal(staffCanDo(ANA, ['corte', 'tratamento']), false, 'one unknown service is enough to rule her out');
});

test('empty and malformed input never crashes or silently excludes', () => {
  assert.equal(staffCanDo(ANA, []), true, 'asking for nothing excludes nobody');
  assert.equal(staffCanDo(null, ['corte']), true, 'a missing staff object is not a restriction');
  assert.equal(staffCanDo({ serviceIds: null }, ['corte']), true);
  assert.equal(staffCanDo(ANA, [null, 'corte']), true, 'blank ids are ignored, not treated as unknown');
  assert.equal(staffCanDo({ serviceIds: ['corte', null] }, ['corte']), true);
});

test('staffFor filters a team and keeps the owner\'s order', () => {
  const team = [ANA, RUI, TODA];
  assert.deepEqual(staffFor(team, ['corte']).map(s => s.id), ['ana', 'rui', 'toda']);
  assert.deepEqual(staffFor(team, ['cor']).map(s => s.id), ['ana', 'toda'], 'Rui drops out of colour');
  assert.deepEqual(staffFor(team, ['corte', 'cor']).map(s => s.id), ['ana', 'toda']);
  assert.deepEqual(staffFor(team, ['tratamento']).map(s => s.id), ['toda'], 'only the unrestricted person is left');
  assert.deepEqual(staffFor([], ['corte']), []);
  assert.deepEqual(staffFor(null, ['corte']), []);
});

test('a salon where everyone is restricted can end up with nobody', () => {
  assert.deepEqual(staffFor([ANA, RUI], ['manicure']), [], 'the UI must say so instead of offering an empty calendar');
});
