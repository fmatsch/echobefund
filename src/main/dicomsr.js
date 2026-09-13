// Minimaler Leser für DICOM Structured Reports (SR), z. B. Messungen vom Echogerät.
// Unterstützt: Explicit/Implicit VR Little Endian und Deflated Explicit VR Little Endian.
const zlib = require('node:zlib');

const TS_IMPLICIT = '1.2.840.10008.1.2';
const TS_DEFLATED = '1.2.840.10008.1.2.1.99';
const TS_BIG_ENDIAN = '1.2.840.10008.1.2.2';

const LONG_VRS = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);
// Sequenzen, die bei Implicit VR ohne Wörterbuch erkannt werden müssen
const SQ_TAGS = new Set([
  '0040A730', '0040A043', '0040A300', '004008EA', '0040A168', '0040A504', '0040A375', '0040A385',
  '0040A073', '00081115', '00081199', '00081111', '00081032', '00400441', '0040A088', '0040A195',
]);
const UNDEFINED = 0xffffffff;
const MAX_DEPTH = 64;

const tagOf = (g, e) => (g.toString(16).padStart(4, '0') + e.toString(16).padStart(4, '0')).toUpperCase();

function readElement(buf, pos, explicit, depth) {
  if (pos + 8 > buf.length) throw new Error('Datei unvollständig');
  const g = buf.readUInt16LE(pos);
  const e = buf.readUInt16LE(pos + 2);
  const tag = tagOf(g, e);
  let vr;
  let len;
  let header;
  if (g === 0xfffe) {
    return { tag, delimiter: e, next: pos + 8 };
  }
  const vrText = buf.toString('latin1', pos + 4, pos + 6);
  if (explicit && /^[A-Z]{2}$/.test(vrText)) {
    vr = vrText;
    if (LONG_VRS.has(vr)) {
      if (pos + 12 > buf.length) throw new Error('Datei unvollständig');
      len = buf.readUInt32LE(pos + 8);
      header = 12;
    } else {
      len = buf.readUInt16LE(pos + 6);
      header = 8;
    }
  } else {
    len = buf.readUInt32LE(pos + 4);
    header = 8;
    vr = SQ_TAGS.has(tag) || len === UNDEFINED ? 'SQ' : 'UN';
  }
  let p = pos + header;
  if (vr === 'SQ' || (vr === 'UN' && len === UNDEFINED)) {
    // UN mit undefinierter Länge ist laut Standard als Implicit VR kodiert
    const seqExplicit = vr === 'SQ' ? explicit : false;
    const { items, next } = readSequence(buf, p, len, seqExplicit, depth + 1);
    return { tag, vr: 'SQ', items, next };
  }
  if (len === UNDEFINED) throw new Error(`Nicht unterstützte Kodierung im Element ${tag}`);
  if (p + len > buf.length) throw new Error('Datei unvollständig');
  return { tag, vr, value: buf.subarray(p, p + len), next: p + len };
}

function readDataset(buf, pos, end, explicit, depth) {
  const ds = new Map();
  while (pos < end) {
    const el = readElement(buf, pos, explicit, depth);
    if (el.delimiter !== undefined) {
      pos = el.next;
      if (el.delimiter === 0xe00d) break; // Ende eines Items mit undefinierter Länge
      continue;
    }
    if (el.tag === '7FE00010') break; // Bilddaten: für SR irrelevant
    ds.set(el.tag, el);
    pos = el.next;
  }
  return { ds, next: pos };
}

function readSequence(buf, pos, len, explicit, depth) {
  if (depth > MAX_DEPTH) throw new Error('Struktur zu tief verschachtelt');
  const items = [];
  const end = len === UNDEFINED ? buf.length : pos + len;
  while (pos < end) {
    if (pos + 8 > buf.length) throw new Error('Datei unvollständig');
    const g = buf.readUInt16LE(pos);
    const e = buf.readUInt16LE(pos + 2);
    const itemLen = buf.readUInt32LE(pos + 4);
    pos += 8;
    if (g !== 0xfffe) throw new Error('Ungültige Sequenz');
    if (e === 0xe0dd) break; // Ende der Sequenz
    if (e !== 0xe000) continue;
    if (itemLen === UNDEFINED) {
      const r = readDataset(buf, pos, buf.length, explicit, depth);
      items.push(r.ds);
      pos = r.next;
    } else {
      if (pos + itemLen > buf.length) throw new Error('Datei unvollständig');
      items.push(readDataset(buf, pos, pos + itemLen, explicit, depth).ds);
      pos += itemLen;
    }
  }
  return { items, next: len === UNDEFINED ? pos : end };
}

// Liest die komplette Datei in eine Map (Tag → Element).
function parseDicom(buffer) {
  let buf = buffer;
  let pos = 0;
  const meta = new Map();
  if (buf.length >= 132 && buf.toString('latin1', 128, 132) === 'DICM') {
    pos = 132;
    while (pos + 8 <= buf.length && buf.readUInt16LE(pos) === 0x0002) {
      const el = readElement(buf, pos, true, 0);
      meta.set(el.tag, el);
      pos = el.next;
    }
  }
  const tsEl = meta.get('00020010');
  const ts = tsEl ? tsEl.value.toString('latin1').replace(/[\0\s]+$/, '') : '';
  if (ts === TS_BIG_ENDIAN) throw new Error('Big-Endian-Kodierung wird nicht unterstützt');
  if (ts === TS_DEFLATED) {
    buf = zlib.inflateRawSync(buf.subarray(pos));
    pos = 0;
  }
  let explicit;
  if (ts) explicit = ts !== TS_IMPLICIT;
  else explicit = buf.length >= pos + 6 && /^[A-Z]{2}$/.test(buf.toString('latin1', pos + 4, pos + 6));
  const { ds } = readDataset(buf, pos, buf.length, explicit, 0);
  for (const [k, v] of meta) ds.set(k, v);
  return ds;
}

// ---------- SR-Inhalt ----------

function readStructuredReport(buffer) {
  const ds = parseDicom(buffer);
  const charset = ds.get('00080005');
  const encoding = charset && /ISO_IR 192/.test(charset.value.toString('latin1')) ? 'utf8' : 'latin1';
  const str = (item, tag) => {
    const el = item.get(tag);
    return el && el.value ? el.value.toString(encoding).replace(/[\0\s]+$/, '').trim() : '';
  };
  const seq = (item, tag) => (item.get(tag) && item.get(tag).items) || [];
  const codeMeaning = (item, tag) => {
    const it = seq(item, tag)[0];
    return it ? str(it, '00080104') || str(it, '00080100') : '';
  };
  const codeValue = (item, tag) => {
    const it = seq(item, tag)[0];
    return it ? str(it, '00080100') : '';
  };

  const isSR = str(ds, '00080060') === 'SR' || ds.has('0040A730');
  if (!isSR) throw new Error('Keine strukturierte Befunddatei (DICOM-SR)');

  const measurements = [];
  const walk = (item, context, depth) => {
    if (depth > MAX_DEPTH) return;
    const valueType = str(item, '0040A040');
    const name = codeMeaning(item, '0040A043');
    const children = seq(item, '0040A730');
    const modifiers = children
      .filter((c) => ['HAS CONCEPT MOD', 'HAS ACQ CONTEXT'].includes(str(c, '0040A010')) && str(c, '0040A040') === 'CODE')
      .map((c) => codeMeaning(c, '0040A168'))
      .filter(Boolean);

    if (valueType === 'NUM') {
      const mv = seq(item, '0040A300')[0];
      if (mv) {
        const value = parseFloat(str(mv, '0040A30A').split('\\')[0]);
        if (Number.isFinite(value)) {
          measurements.push({
            label: dedupe([...context, name, ...modifiers]).join(' › '),
            value,
            unit: codeValue(mv, '004008EA'),
            unitMeaning: codeMeaning(mv, '004008EA'),
          });
        }
      }
    }
    // Wurzel-Titel (z. B. "Adult Echocardiography Procedure Report") nicht in die Bezeichnung übernehmen
    const nextContext = valueType === 'CONTAINER' && depth > 0 ? [...context, name, ...modifiers] : context;
    for (const child of children) walk(child, nextContext, depth + 1);
  };
  walk(ds, [], 0);

  const da = (s) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '');
  return {
    title: codeMeaning(ds, '0040A043'),
    patient: {
      name: str(ds, '00100010').replace(/\^+/g, ' ').trim(),
      id: str(ds, '00100020'),
      birthDate: da(str(ds, '00100030')),
    },
    studyDate: da(str(ds, '00080020')),
    manufacturer: str(ds, '00080070'),
    measurements,
  };
}

function dedupe(parts) {
  const out = [];
  for (const p of parts) if (p && out[out.length - 1] !== p) out.push(p);
  return out;
}

module.exports = { parseDicom, readStructuredReport };
