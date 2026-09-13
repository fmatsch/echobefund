const test = require('node:test');
const assert = require('node:assert/strict');
const { autoGrade, autoGradeAll, diastolicGrade, comparisonText, generate } = require('../src/shared/report');
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
  assert.deepEqual(autoGradeAll(NORMS, { vci: 25, trVmax: 3.0 }, 'm', {}), {
    vciSize: 'erweitert',
    ph: 'mittlere Wahrscheinlichkeit',
  });
});

test('Quantifizierung: Insuffizienzen und RV-Funktion', () => {
  assert.equal(autoGrade('mvInsuff', NORMS, { mrEroa: 0.15 }), 'leichtgradig');
  assert.equal(autoGrade('mvInsuff', NORMS, { mrEroa: 0.25, mrRvol: 50 }), 'mittel- bis hochgradig');
  assert.equal(autoGrade('mvInsuff', NORMS, { mrVc: 7.5 }), 'hochgradig');
  assert.equal(autoGrade('avInsuff', NORMS, { arPht: 180 }), 'hochgradig');
  assert.equal(autoGrade('avInsuff', NORMS, { arPht: 650 }), 'leichtgradig');
  assert.equal(autoGrade('tvInsuff', NORMS, { trVc: 8 }), 'hochgradig');
  assert.equal(autoGrade('rvFunction', NORMS, { tapse: 20, rvFac: 30 }), 'leichtgradig');
  assert.equal(autoGrade('mvInsuff', NORMS, {}), undefined);
});

test('Diastolische Funktion nach ASE/EACVI 2016', () => {
  // normale EF: 0 von 4 Kriterien → normal
  assert.equal(diastolicGrade({ lvef: 60, eePrime: 8, ePrimeSept: 9, ePrimeLat: 12, trVmax: 2.2, lavi: 28 }), 'normal');
  // normale EF: genau 50 % → nicht beurteilbar
  assert.equal(diastolicGrade({ lvef: 60, eePrime: 15, ePrimeSept: 6, trVmax: 2.2, lavi: 28 }), 'nicht beurteilbar');
  // normale EF: > 50 % positiv, E/A 1,2 und 2 von 3 Füllungsdruck-Kriterien → Grad II
  assert.equal(diastolicGrade({ lvef: 60, eePrime: 16, ePrimeSept: 5, trVmax: 3.0, lavi: 30, ea: 1.2, eWave: 90 }), 'Grad II');
  // reduzierte EF: E/A ≤ 0,8 und E ≤ 50 cm/s → Grad I
  assert.equal(diastolicGrade({ lvef: 35, ea: 0.7, eWave: 45 }), 'Grad I');
  // reduzierte EF: E/A ≥ 2 → Grad III
  assert.equal(diastolicGrade({ lvef: 35, ea: 2.3, eWave: 110 }), 'Grad III');
  // reduzierte EF, E/A 1,0: 2 von 3 Kriterien negativ → Grad I
  assert.equal(diastolicGrade({ lvef: 35, ea: 1.0, eWave: 70, eePrime: 10, trVmax: 3.1, lavi: 30 }), 'Grad I');
  // reduzierte EF: nur 2 Kriterien, 1:1 → nicht beurteilbar
  assert.equal(diastolicGrade({ lvef: 35, ea: 1.0, eWave: 70, eePrime: 16, lavi: 30 }), 'nicht beurteilbar');
  // zu wenige Daten bzw. Vorhofflimmern → keine Aussage
  assert.equal(diastolicGrade({ lvef: 60, eePrime: 8 }), undefined);
  assert.equal(diastolicGrade({ lvef: 35, ea: 0.7, eWave: 45 }, { rhythmus: 'Vorhofflimmern' }), undefined);
  assert.equal(autoGradeAll(NORMS, { lvef: 35, ea: 0.7, eWave: 45 }, 'm', {}).diastolic, 'Grad I');
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

test('Beurteilung: auffällige Befunde, sonst Normalbefund', () => {
  const text = generate({
    values: { lvef: 38 },
    assess: { rhythmus: 'Sinusrhythmus', lvFunction: 'mittelgradig', avMorph: 'hochgradig verkalkt', avStenosis: 'hochgradig', mvInsuff: 'minimal' },
    settings: SETTINGS,
  });
  assert.equal(text.split('\n\n').at(-1), 'Beurteilung: Mittelgradig eingeschränkte systolische linksventrikuläre Funktion. Hochgradige Aortenklappenstenose.');
  const normal = generate({ values: {}, assess: { lvSize: 'normal', mvInsuff: 'minimal' }, settings: SETTINGS });
  assert.match(normal, /Beurteilung: Echokardiographischer Normalbefund\.$/);
  const off = generate({ values: {}, assess: { lvSize: 'normal' }, settings: { ...SETTINGS, summary: { ...SETTINGS.summary, enabled: false } } });
  assert.doesNotMatch(off, /Beurteilung/);
});

test('Verlaufsvergleich mit Vorbefund', () => {
  const text = generate({
    values: { lvef: 42, lvedd: 58 },
    assess: { lvFunction: 'leichtgradig', avStenosis: 'mittelgradig' },
    settings: SETTINGS,
    previous: { datum: '2025-03-12', values: { lvef: 55, lvedd: 58 }, assess: { lvFunction: 'normal', avStenosis: 'leichtgradig' } },
  });
  assert.match(text, /Verlauf: Im Vergleich zur Voruntersuchung vom 12\.03\.2025: LVEF 42 % \(zuvor 55 %\); LV-Funktion leichtgradig \(zuvor normal\); Aortenklappenstenose mittelgradig \(zuvor leichtgradig\)\./);
  assert.equal(
    comparisonText({ values: { lvef: 55 }, assess: {} }, { datum: '2025-03-12', values: { lvef: 55.2 }, assess: {} }),
    'Im Vergleich zur Voruntersuchung vom 12.03.2025: Messwerte und Beurteilungen unverändert.',
  );
  assert.equal(comparisonText({ values: { lvef: 55 }, assess: {} }, { datum: '2025-03-12', values: {}, assess: {} }), '');
});

test('Zusatzmodule Stressecho und TEE nur, wenn aktiv', () => {
  const assess = {
    stressType: 'Fahrradergometrie', stressStop: ['Erschöpfung', 'Dyspnoe'], stressResult: 'kein Ischämienachweis',
    teeLaa: 'kein Thrombus', teeIas: 'PFO', teeShunt: 'Shunt nach Valsalva',
  };
  const values = { stressWatt: 150 };
  const off = generate({ values, assess, settings: SETTINGS });
  assert.doesNotMatch(off, /Stressechokardiographie|Vorhofohr/);
  const on = generate({ values, assess, settings: { ...SETTINGS, modules: { pk: false, stress: true, tee: true } } });
  assert.match(on, /Stressecho: Stressechokardiographie mittels Fahrradergometrie \(max\. 150 W\)\. Abbruch wegen muskulärer Erschöpfung und Dyspnoe\. Kein Nachweis einer belastungsinduzierten Ischämie\./);
  assert.match(on, /TEE: Kein Thrombus im linken Vorhof und Vorhofohr\. Persistierendes Foramen ovale, Rechts-links-Shunt nach Valsalva-Manöver\./);
  assert.match(on, /Beurteilung: Kein Nachweis einer belastungsinduzierten Ischämie\. Kein Thrombus im linken Vorhof und Vorhofohr\. Persistierendes Foramen ovale, Rechts-links-Shunt nach Valsalva-Manöver\.$/);
});
