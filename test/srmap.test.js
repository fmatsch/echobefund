const test = require('node:test');
const assert = require('node:assert/strict');
const { convertUnit, suggestMeasure, resolveMapping, normalizeName } = require('../src/shared/srmap');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('Einheiten umrechnen', () => {
  assert.equal(convertUnit(5.2, 'cm', 'mm'), 52);
  near(convertUnit(0.82, 'm/s', 'cm/s'), 82);
  near(convertUnit(310, 'cm/s', 'm/s'), 3.1);
  assert.equal(convertUnit(24, 'mm[Hg]', 'mmHg'), 24);
  assert.equal(convertUnit(0.3, 'cm2', 'cm²'), 0.3);
  assert.equal(convertUnit(58, '%', '%'), 58);
  assert.equal(convertUnit(0.25, 's', 'ms'), 250);
  assert.equal(convertUnit(5, 'cm', '%'), null);
  assert.equal(convertUnit(NaN, 'cm', 'mm'), null);
});

test('Zuordnungsvorschläge aus englischen DICOM-Bezeichnungen', () => {
  assert.equal(suggestMeasure('Findings › Left Ventricle › Left Ventricle Internal End Diastolic Dimension', 'cm'), 'lvedd');
  assert.equal(suggestMeasure('Left Ventricle Internal End Systolic Dimension', 'cm'), 'lvesd');
  assert.equal(suggestMeasure('Findings › Mitral Valve › E-Wave Peak Velocity', 'm/s'), 'eWave');
  assert.equal(suggestMeasure('Mitral Annulus Septal E prime Peak Velocity', 'cm/s'), 'ePrimeSept');
  assert.equal(suggestMeasure('Left Ventricular Ejection Fraction', '%'), 'lvef');
  assert.equal(suggestMeasure('Aortic Valve › Mean Pressure Gradient', 'mm[Hg]'), 'avPmean');
  assert.equal(suggestMeasure('Mitral Valve › Vena Contracta Width', 'cm'), 'mrVc');
  // passende Bezeichnung, aber unpassende Einheit → kein Vorschlag
  assert.equal(suggestMeasure('Left Ventricular Ejection Fraction', 'cm'), null);
  assert.equal(suggestMeasure('Unbekannte Herstellermessung', 'mm'), null);
});

test('Gemerkte Zuordnungen haben Vorrang', () => {
  const item = { label: 'Vendor › LV EDD', unit: 'mm', value: 50 };
  assert.deepEqual(resolveMapping(item, { 'Vendor › LV EDD|mm': 'lvedd' }), { measureId: 'lvedd', source: 'gemerkt' });
  assert.deepEqual(resolveMapping(item, { 'Vendor › LV EDD|mm': '' }), { measureId: '', source: 'gemerkt' });
  assert.deepEqual(resolveMapping(item, {}), { measureId: '', source: null });
});

test('Patientennamen vergleichbar machen', () => {
  assert.equal(normalizeName('Mustermann^Max'), normalizeName('Max Mustermann'));
  assert.notEqual(normalizeName('Mustermann^Max'), normalizeName('Muster^Max'));
});
