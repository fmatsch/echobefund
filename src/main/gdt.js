// GDT 2.1 (Gerätedaten-Transfer): Kodierung, Sätze erzeugen/lesen, Dateinamen.
// Rolle dieser App: GERÄT. Die Praxis-EDV (z. B. EOSWIN) sendet 6301/6302/6311, wir antworten mit 6310.

const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐' +
  '└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

// CP1252 weicht nur in 0x80–0x9F von ISO-8859-1 ab.
const CP1252_80_9F = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

const CHARSETS = { '1': '7 Bit (ASCII)', '2': 'IBM CP437 (GDT-Standard)', '3': 'ANSI CP1252' };

function charTable(cs) {
  const decode = new Array(256);
  for (let i = 0; i < 128; i++) decode[i] = String.fromCharCode(i);
  for (let i = 128; i < 256; i++) {
    if (cs === '2') decode[i] = CP437_HIGH[i - 128];
    else if (cs === '3') decode[i] = i < 0xa0 ? CP1252_80_9F[i - 128] : String.fromCharCode(i);
    else decode[i] = '?';
  }
  const encode = new Map();
  const limit = cs === '1' ? 128 : 256;
  for (let i = 32; i < limit; i++) if (!encode.has(decode[i])) encode.set(decode[i], i);
  return { decode, encode };
}
const TABLES = { '1': charTable('1'), '2': charTable('2'), '3': charTable('3') };

// Ersatz für Zeichen, die im Ziel-Zeichensatz fehlen.
const FALLBACK = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss',
  '²': '2', '³': '3', '°': ' Grad', 'µ': 'u', '±': '+/-', '≥': '>=', '≤': '<=', '×': 'x',
  '–': '-', '—': '-', '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'", '…': '...',
  '•': '-', '·': '.', '€': 'EUR', ' ': ' ', '\t': ' ',
};

function normalizeCharset(cs) {
  const s = String(cs || '').trim();
  return TABLES[s] ? s : '2';
}

function encode(text, cs) {
  const { encode: map } = TABLES[normalizeCharset(cs)];
  const bytes = [];
  for (const ch of String(text).normalize('NFC')) {
    if (map.has(ch)) { bytes.push(map.get(ch)); continue; }
    const alt = FALLBACK[ch];
    if (alt !== undefined) {
      for (const c of alt) bytes.push(map.has(c) ? map.get(c) : 0x3f);
    } else {
      const base = ch.normalize('NFD')[0]; // é → e, falls nicht darstellbar
      bytes.push(map.has(base) ? map.get(base) : 0x3f);
    }
  }
  return Buffer.from(bytes);
}

function decode(buf, cs) {
  const { decode: table } = TABLES[normalizeCharset(cs)];
  let s = '';
  for (const b of buf) s += table[b];
  return s;
}

// ---------- Sätze ----------

const CRLF = Buffer.from('\r\n', 'ascii');

function encodeLine(fk, content, cs) {
  const body = encode(content, cs);
  const len = 3 + 4 + body.length + 2;
  if (len > 999) throw new Error(`GDT-Zeile zu lang (Feld ${fk})`);
  return Buffer.concat([Buffer.from(String(len).padStart(3, '0') + fk, 'ascii'), body, CRLF]);
}

// fields: [[fk, inhalt], ...] ohne 8000/8100. Liefert Buffer des kompletten Satzes.
function buildRecord(satzart, fields, cs) {
  const head = encodeLine('8000', satzart, cs);
  const rest = fields
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([fk, v]) => encodeLine(fk, String(v), cs));
  const lenLineSize = 3 + 4 + 5 + 2;
  const total = head.length + lenLineSize + rest.reduce((n, b) => n + b.length, 0);
  const lenLine = encodeLine('8100', String(total).padStart(5, '0'), cs);
  return Buffer.concat([head, lenLine, ...rest]);
}

// Liest eine GDT-Datei. Liefert [{ satzart, fields: [[fk, inhalt]], get(fk), all(fk) }].
function parse(buf) {
  // Zeichensatz aus Feld 9206 bestimmen (Feldkennungen sind ASCII-sicher).
  const raw = buf.toString('latin1');
  const csMatch = raw.match(/(?:^|\n)\d{3}9206(\d)/);
  const cs = csMatch ? normalizeCharset(csMatch[1]) : '2';
  const records = [];
  let current = null;
  for (const lineBuf of splitLines(buf)) {
    if (lineBuf.length < 7) continue;
    const prefix = lineBuf.subarray(0, 7).toString('ascii');
    if (!/^\d{7}$/.test(prefix)) continue;
    const fk = prefix.slice(3);
    const content = decode(lineBuf.subarray(7), cs);
    if (fk === '8000') {
      current = { satzart: content.trim(), charset: cs, fields: [] };
      records.push(current);
    } else if (current) {
      current.fields.push([fk, content]);
    }
  }
  for (const r of records) {
    r.all = (fk) => r.fields.filter(([k]) => k === fk).map(([, v]) => v);
    r.get = (fk) => r.all(fk)[0];
  }
  return records;
}

function splitLines(buf) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      const end = i > start && buf[i - 1] === 0x0d ? i - 1 : i;
      lines.push(buf.subarray(start, end));
      start = i + 1;
    }
  }
  if (start < buf.length) lines.push(buf.subarray(start));
  return lines;
}

// ---------- Inhalte ----------

// TTMMJJJJ ↔ JJJJ-MM-TT
const gdtDateToIso = (s) => {
  const m = String(s || '').trim().match(/^(\d{2})\.?(\d{2})\.?(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const isoToGdtDate = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}${m[2]}${m[1]}` : undefined;
};

function parseSex(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === '1' || s === 'm') return 'm';
  if (s === '2' || s === 'w' || s === 'f') return 'w';
  return '';
}

// Wandelt einen empfangenen Satz in eine Anfrage für die App.
function toRequest(record) {
  const num = (v) => {
    const n = Number(String(v || '').trim().replace(',', '.'));
    return String(v || '').trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    type: { '6301': 'stammdaten', '6302': 'untersuchung', '6311': 'anzeigen' }[record.satzart] || 'unbekannt',
    satzart: record.satzart,
    charset: record.charset,
    senderId: (record.get('8316') || '').trim(),
    receiverId: (record.get('8315') || '').trim(),
    testType: (record.get('8402') || '').trim(),
    patient: {
      patId: (record.get('3000') || '').trim(),
      name: [record.get('3100'), record.get('3101')].filter((x) => x && x.trim()).map((x) => x.trim()).join(' '),
      vorname: (record.get('3102') || '').trim(),
      geburtsdatum: gdtDateToIso(record.get('3103')),
      sex: parseSex(record.get('3110')),
    },
    groesse: num(record.get('3622')),
    gewicht: num(record.get('3623')),
    datum: gdtDateToIso(record.get('6200')),
  };
}

// Bricht Text in Zeilen mit max. `width` Zeichen um (Absätze bleiben als Leerzeile erhalten).
function wrapText(text, width) {
  const w = Math.max(20, Math.min(Number(width) || 60, 990));
  const out = [];
  for (const para of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let word of words) {
      while (word.length > w) {
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, w));
        word = word.slice(w);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= w) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

const trunc = (s, n) => (s == null ? undefined : String(s).slice(0, n));

// Erzeugt Satz 6310 "Daten einer Untersuchung übermitteln".
// data: { patient, reportText, measures: [{id, label, value, unit}], pdfPath, now: Date }
// cfg:  { ownId, pvsId, charset, testType, textField ('6220'|'6228'), lineWidth, sendMeasures }
function buildResult(data, cfg) {
  const p = data.patient || {};
  const now = data.now || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const cs = normalizeCharset(cfg.charset);

  const fields = [
    ['8315', trunc(cfg.pvsId, 8) || undefined],
    ['8316', trunc(cfg.ownId, 8) || undefined],
    ['9206', cs],
    ['9218', '02.10'],
    ['3000', p.patId || '0'],
    ['3101', trunc(p.name, 28) || undefined],
    ['3102', trunc(p.vorname, 28) || undefined],
    ['3103', isoToGdtDate(p.geburtsdatum)],
    ['3110', p.sex === 'm' ? '1' : p.sex === 'w' ? '2' : undefined],
    ['3622', data.groesse ? String(Math.round(data.groesse)) : undefined],
    ['3623', data.gewicht ? String(Math.round(data.gewicht)) : undefined],
    ['8402', trunc(cfg.testType || 'SONO00', 6)],
    ['6200', isoToGdtDate(p.datum) || date],
    ['6201', time],
  ];

  const textField = cfg.textField === '6220' ? '6220' : '6228';
  for (const line of wrapText(data.reportText || '', cfg.lineWidth || 60)) fields.push([textField, line]);

  if (data.pdfPath) {
    fields.push(['6302', 'Echobefund'], ['6303', 'PDF'], ['6304', 'Befundbericht Echokardiographie'], ['6305', data.pdfPath]);
  }

  if (cfg.sendMeasures) {
    for (const m of data.measures || []) {
      fields.push(['8410', trunc(m.id, 20)], ['8411', trunc(m.label, 60)], ['8420', String(m.value)]);
      if (m.unit) fields.push(['8421', trunc(m.unit, 60)]);
    }
  }
  if (p.untersucher) fields.push(['8990', trunc(p.untersucher, 60)]);

  return buildRecord('6310', fields, cs);
}

// ---------- Dateinamen ----------

const shortId = (s) => String(s || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 4).toUpperCase();

// Dateien, die an uns adressiert sind: <Empfänger=wir><Sender=EDV>.GDT oder .001–.999
function incomingPattern(ownShort, pvsShort) {
  const base = `${shortId(ownShort)}${shortId(pvsShort)}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${base}\\.(GDT|\\d{3})$`, 'i');
}

// Nächster Name für eine Datei an die EDV. existing: vorhandene Dateinamen im Austauschordner.
// Liefert null, wenn bei festem Namen die vorherige Datei noch nicht abgeholt wurde.
function outgoingName(ownShort, pvsShort, mode, existing) {
  const base = `${shortId(pvsShort)}${shortId(ownShort)}`;
  const names = existing.map((n) => n.toUpperCase());
  if (mode !== 'counter') return names.includes(`${base}.GDT`) ? null : `${base}.GDT`;
  const used = names
    .map((n) => n.match(new RegExp(`^${base}\\.(\\d{3})$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = used.length ? Math.max(...used) + 1 : 1;
  return next > 999 ? null : `${base}.${String(next).padStart(3, '0')}`;
}

// Dateien, die wir an die EDV geschickt haben: <Empfänger=EDV><Sender=wir>.GDT oder .001–.999
function outgoingPattern(ownShort, pvsShort) {
  return incomingPattern(pvsShort, ownShort);
}

// ---------- Verbindungsstatus ----------

// Liefert den Zustand für die Ampel-Anzeige.
// outgoing: [{ name, mtime }] noch nicht abgeholte Befunddateien im Austauschordner.
// state: 'off' | 'unconfigured' | 'unreachable' | 'waiting' | 'ok'
function evaluateStatus({ enabled, dir, dirReadable, outgoing = [], now = Date.now(), warnMs = 120000 }) {
  if (!enabled) return { state: 'off' };
  if (!dir) return { state: 'unconfigured' };
  if (!dirReadable) return { state: 'unreachable' };
  const stale = outgoing.filter((f) => now - f.mtime >= warnMs).sort((a, b) => a.mtime - b.mtime);
  if (stale.length) return { state: 'waiting', file: stale[0].name, since: Math.round(stale[0].mtime) };
  return { state: 'ok' };
}

module.exports = {
  CHARSETS, encode, decode, encodeLine, buildRecord, parse, toRequest, wrapText, buildResult,
  incomingPattern, outgoingPattern, outgoingName, evaluateStatus, gdtDateToIso, isoToGdtDate, CP437_HIGH,
};
