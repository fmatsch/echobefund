const test = require('node:test');
const assert = require('node:assert/strict');
const { autoGrade, autoGradeAll, generate } = require('../src/shared/report');
const { SETTINGS, NORMS } = require('../src/shared/defaults');

test('Automatische Bewertung geschlechtsspezifisch', () => {
  assert.equal(autoGrade('lvSize', NORMS, { lvedd: 60 }, 'm'), 'leichtgradig');
  assert.equal(autoGrade('lvSize', NORMS, { lvedd: 50 }, 'w'), 'normal');
  assert.equal(autoGrade('lvSize', NORMS, { lvedd: 60 }, ''), undefined);
  assert.equal(autoGrade('lvFunction', NORMS, { lvef: 35 }, 'w'), 'mittelgradig');
});

test('Regel-Modus: erster verfügbarer Messwert bzw. schwerster Grad', () => {
  assert.equal(autoGrade('laSize', NORMS, { lavi: 30, laDiam: 50 }, 'm'), 'normal');
  assert.equal(autoGrade('avStenosis', NORMS, { avVmax: 2.8, avPmean: 42 }), 'hochgradig');
  assert.equal(autoGrade('avStenosis', NORMS, { avVmax: 2.0 }), 'keine');
});

test('autoGradeAll liefert nur Felder mit Messwerten', () => {
  assert.deepEqual(autoGradeAll(NORMS, { vci: 25, trVmax: 3.0 }, 'm'), {
    vciSize: 'erweitert',
    ph: 'mittlere Wahrscheinlichkeit',
  });
});

test('Befundtext mit Messwerten im Text und Adjektivformen', () => {
  const text = generate({
    values: { lvedd: 60, avVmax: 3.4 },
    assess: { lvSize: 'leichtgradig', avStenosis: 'leicht- bis mittelgradig', avMorph: 'unauffällig' },
    settings: SETTINGS,
  });
  assert.match(text, /Linker Ventrikel: Leichtgradig dilatierter linker Ventrikel \(LVEDD 60 mm\)\./);
  assert.match(text, /Leicht- bis mittelgradige Aortenklappenstenose \(AK Vmax 3,4 m\/s\)\./);
});

test('Fragmente, ausgeblendete Felder und Wandbewegungsstörungen', () => {
  const text = generate({
    values: {},
    assess: {
      diastolic: 'nicht beurteilbar', diastolicReason: 'Vorhofflimmern',
      wma: 'regional', wmaSegments: { 3: 'Hypokinesie', 9: 'Hypokinesie', 16: 'Akinesie' },
      avMorph: 'St.p. TAVI', avInsuff: 'hochgradig', avInsuffParav: 'minimal',
      pericard: 'geringer', pericardExtras: ['zirkulär'],
    },
    settings: SETTINGS,
  });
  assert.match(text, /Diastolische Funktion nicht beurteilbar bei Vorhofflimmern\./);
  assert.match(text, /Hypokinesie basal inferior, mittventrikulär inferior; Akinesie Apex\./);
  assert.doesNotMatch(text, /Aortenklappeninsuffizienz/);
  assert.match(text, /Minimales paravalvuläres Leck\./);
  assert.match(text, /Geringer Perikarderguss, zirkulär\./);
});

test('Messwert-Liste am Beginn statt im Text', () => {
  const text = generate({
    values: { lvedd: 52, bsa: 1.9 },
    assess: { lvSize: 'normal' },
    settings: { ...SETTINGS, measuresMode: 'liste' },
  });
  assert.match(text, /^Messwerte:\nAllgemein: KOF 1,90 m²\nLV: LVEDD 52 mm/);
  assert.match(text, /Normal großer linker Ventrikel\./);
});
