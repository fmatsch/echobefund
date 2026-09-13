const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { readStructuredReport } = require('../src/main/dicomsr');

// ---------- Kleiner DICOM-Schreiber für synthetische Testdateien ----------
const LONG = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const tagBytes = (tag) => { const b = Buffer.alloc(4); b.writeUInt16LE(parseInt(tag.slice(0, 4), 16), 0); b.writeUInt16LE(parseInt(tag.slice(4), 16), 2); return b; };

function el(tag, vr, value, ex) {
  let v = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'latin1');
  if (v.length % 2) v = Buffer.concat([v, Buffer.from(vr === 'UI' ? '\0' : ' ')]);
  if (!ex) return Buffer.concat([tagBytes(tag), u32(v.length), v]);
  if (LONG.has(vr)) {
    const h = Buffer.alloc(8); h.write(vr, 0, 'latin1'); h.writeUInt32LE(v.length, 4);
    return Buffer.concat([tagBytes(tag), h, v]);
  }
  const h = Buffer.alloc(4); h.write(vr, 0, 'latin1'); h.writeUInt16LE(v.length, 2);
  return Buffer.concat([tagBytes(tag), h, v]);
}

function sq(tag, items, ex, ud) {
  const content = Buffer.concat(items.map((parts) => {
    const body = Buffer.concat(parts);
    return ud
      ? Buffer.concat([tagBytes('FFFEE000'), u32(0xffffffff), body, tagBytes('FFFEE00D'), u32(0)])
      : Buffer.concat([tagBytes('FFFEE000'), u32(body.length), body]);
  }));
  const len = ud ? 0xffffffff : content.length;
  const header = ex ? Buffer.concat([tagBytes(tag), Buffer.from('SQ\0\0', 'latin1'), u32(len)]) : Buffer.concat([tagBytes(tag), u32(len)]);
  return Buffer.concat([header, content, ud ? Buffer.concat([tagBytes('FFFEE0DD'), u32(0)]) : Buffer.alloc(0)]);
}

const code = (tag, value, scheme, meaning, ex, ud) =>
  sq(tag, [[el('00080100', 'SH', value, ex), el('00080102', 'SH', scheme, ex), el('00080104', 'LO', meaning, ex)]], ex, ud);

const findingSite = (site, ex, ud) => [
  el('0040A010', 'CS', 'HAS CONCEPT MOD', ex), el('0040A040', 'CS', 'CODE', ex),
  code('0040A043', 'G-C0E3', 'SRT', 'Finding Site', ex, ud), code('0040A168', 'T-00000', 'SRT', site, ex, ud),
];

const num = (name, value, unit, ex, ud) => [
  el('0040A010', 'CS', 'CONTAINS', ex), el('0040A040', 'CS', 'NUM', ex),
  code('0040A043', '00000-0', 'LN', name, ex, ud),
  sq('0040A300', [[el('0040A30A', 'DS', String(value), ex), code('004008EA', unit, 'UCUM', unit, ex, ud)]], ex, ud),
];

const container = (name, site, children, ex, ud) => [
  el('0040A010', 'CS', 'CONTAINS', ex), el('0040A040', 'CS', 'CONTAINER', ex),
  code('0040A043', '121070', 'DCM', name, ex, ud),
  sq('0040A730', [findingSite(site, ex, ud), ...children], ex, ud),
];

function buildSr({ explicit = true, undefinedLength = false, deflate = false, preamble = true }) {
  const ex = explicit || deflate;
  const ud = undefinedLength;
  const dataset = Buffer.concat([
    el('00080005', 'CS', 'ISO_IR 100', ex),
    el('00080020', 'DA', '20260910', ex),
    el('00080060', 'CS', 'SR', ex),
    el('00080070', 'LO', 'Testgerät', ex),
    el('00100010', 'PN', 'Müller^Jürgen', ex),
    el('00100020', 'LO', '4711', ex),
    el('00100030', 'DA', '19601224', ex),
    el('0040A040', 'CS', 'CONTAINER', ex),
    code('0040A043', '125200', 'DCM', 'Adult Echocardiography Procedure Report', ex, ud),
    sq('0040A730', [
      container('Findings', 'Left Ventricle', [
        num('Left Ventricle Internal End Diastolic Dimension', 5.2, 'cm', ex, ud),
        num('Left Ventricular Ejection Fraction', 58, '%', ex, ud),
      ], ex, ud),
      container('Findings', 'Mitral Valve', [num('E-Wave Peak Velocity', 0.82, 'm/s', ex, ud)], ex, ud),
    ], ex, ud),
  ]);
  if (!preamble) return dataset;
  const ts = deflate ? '1.2.840.10008.1.2.1.99' : explicit ? '1.2.840.10008.1.2.1' : '1.2.840.10008.1.2';
  const metaBody = el('00020010', 'UI', ts, true);
  const meta = Buffer.concat([el('00020000', 'UL', u32(metaBody.length), true), metaBody]);
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), meta, deflate ? zlib.deflateRawSync(dataset) : dataset]);
}

const EXPECTED = [
  ['Findings › Left Ventricle › Left Ventricle Internal End Diastolic Dimension', 5.2, 'cm'],
  ['Findings › Left Ventricle › Left Ventricular Ejection Fraction', 58, '%'],
  ['Findings › Mitral Valve › E-Wave Peak Velocity', 0.82, 'm/s'],
];

const VARIANTS = [
  { name: 'Explicit VR', explicit: true },
  { name: 'Implicit VR', explicit: false },
  { name: 'Explicit VR, undefinierte Längen', explicit: true, undefinedLength: true },
  { name: 'Implicit VR, undefinierte Längen', explicit: false, undefinedLength: true },
  { name: 'Deflated', deflate: true },
  { name: 'Implicit VR ohne Präambel', explicit: false, preamble: false },
];

for (const variant of VARIANTS) {
  test(`DICOM-SR lesen: ${variant.name}`, () => {
    const sr = readStructuredReport(buildSr(variant));
    assert.deepEqual(sr.patient, { name: 'Müller Jürgen', id: '4711', birthDate: '1960-12-24' });
    assert.equal(sr.studyDate, '2026-09-10');
    assert.equal(sr.manufacturer, 'Testgerät');
    assert.deepEqual(sr.measurements.map((m) => [m.label, m.value, m.unit]), EXPECTED);
  });
}

test('Keine SR-Datei → verständlicher Fehler', () => {
  const buf = Buffer.concat([
    Buffer.alloc(128), Buffer.from('DICM'),
    el('00020010', 'UI', '1.2.840.10008.1.2.1', true),
    el('00080060', 'CS', 'US', true),
  ]);
  assert.throws(() => readStructuredReport(buf), /Keine strukturierte Befunddatei/);
});

test('Abgeschnittene Datei → Fehler statt Absturz', () => {
  const buf = buildSr({ explicit: true });
  assert.throws(() => readStructuredReport(buf.subarray(0, buf.length - 30)), /unvollständig|Ungültig/);
});
