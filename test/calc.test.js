const test = require('node:test');
const assert = require('node:assert/strict');
const { bsa, ageYears, estimateRap, compute } = require('../src/shared/calc');

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('KOF nach DuBois und Mosteller', () => {
  near(bsa(180, 80, 'dubois'), 1.996);
  near(bsa(180, 80, 'mosteller'), 2.0);
  assert.equal(bsa(undefined, 80), undefined);
});

test('RAP-Schätzung aus V. cava', () => {
  assert.equal(estimateRap(15, 'normal (>50%)'), 3);
  assert.equal(estimateRap(25, 'fehlend'), 15);
  assert.equal(estimateRap(25, 'normal (>50%)'), 8);
  assert.equal(estimateRap(15, 'keine Angabe'), undefined);
});

test('LV-Masse (ASE), RWT und LVMI', () => {
  const r = compute({ ivs: 10, lvedd: 50, lvpw: 10, groesse: 180, gewicht: 80 });
  near(r.lvMass, 181.976);
  near(r.rwt, 0.4);
  near(r.lvmi, 181.976 / r.bsa);
});

test('AÖF per Kontinuitätsgleichung, SV, HZV, DVI', () => {
  const r = compute({ lvotD: 20, lvotVti: 20, avVti: 80, hf: 70 });
  near(r.sv, 62.83);
  near(r.ava, 0.785);
  near(r.dvi, 0.25);
  near(r.co, 4.398);
});

test('sPAP aus TR Vmax + RAP, manueller Wert hat Vorrang', () => {
  assert.equal(compute({ trVmax: 3, vci: 15 }, { vciCollapse: 'normal (>50%)' }).spap, 39);
  assert.equal(compute({ trVmax: 3 }).spap, undefined);
  assert.equal(compute({ trVmax: 3, spapManual: 50 }).spap, 50);
});

test("E/A und gemitteltes E/e'", () => {
  const r = compute({ eWave: 80, aWave: 100, ePrimeSept: 6, ePrimeLat: 10 });
  near(r.ea, 0.8);
  near(r.eePrime, 10);
});

test('Alter am Untersuchungstag', () => {
  assert.equal(ageYears('1960-12-24', '2026-09-13'), 65);
  assert.equal(ageYears('1960-09-13', '2026-09-13'), 66);
  assert.equal(ageYears('', '2026-09-13'), undefined);
});

test('TAPSE/sPAP und Stressecho-Zielfrequenz', () => {
  const r = compute({ tapse: 20, trVmax: 3, vci: 15, stressHfMax: 140 }, { vciCollapse: 'normal (>50%)' }, { age: 60 });
  near(r.tapseSpap, 20 / 39);
  near(r.stressHfTarget, 136);
  near(r.stressHfPercent, 87.5);
  assert.equal(r.age, 60);
  assert.equal(compute({ stressHfMax: 140 }).stressHfPercent, undefined);
});
