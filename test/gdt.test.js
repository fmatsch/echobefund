const test = require('node:test');
const assert = require('node:assert/strict');
const gdt = require('../src/main/gdt');

test('CP437-Tabelle hat 128 Zeichen', () => {
  assert.equal([...gdt.CP437_HIGH].length, 128);
});

test('Zeichensätze: Umlaute in CP437, CP1252 und 7 Bit', () => {
  assert.deepEqual([...gdt.encode('äöüß', '2')], [0x84, 0x94, 0x81, 0xe1]);
  assert.deepEqual([...gdt.encode('äöüß', '3')], [0xe4, 0xf6, 0xfc, 0xdf]);
  assert.equal(gdt.encode('Größe m² ≥ 3', '1').toString('ascii'), 'Groesse m2 >= 3');
  assert.equal(gdt.encode('– „x“', '3').toString('latin1'), '\x96 \x84x\x93');
  assert.equal(gdt.decode(gdt.encode('Übergröße 5 m²', '2'), '2'), 'Übergröße 5 m²');
  assert.equal(gdt.decode(gdt.encode('Übergröße 5 m²', '3'), '3'), 'Übergröße 5 m²');
});

test('Zeilenaufbau entspricht dem Beispiel der Spezifikation', () => {
  assert.equal(gdt.encodeLine('3101', 'Schmidt', '2').toString('ascii'), '0163101Schmidt\r\n');
});

test('Satzlänge 8100 wie im Spezifikationsbeispiel "Stammdaten übermitteln" (173 Bytes)', () => {
  const rec = gdt.buildRecord('6301', [
    ['8315', 'EKG_TYP1'], ['8316', 'PRAX_EDV'], ['9218', '02.10'], ['3000', '02345'],
    ['3101', 'Mustermann'], ['3102', 'Franz'], ['3103', '01101945'], ['3110', '1'], ['3622', '178'], ['3623', '079'],
  ], '2');
  assert.equal(rec.length, 173);
  assert.match(rec.toString('ascii'), /^01380006301\r\n014810000173\r\n0178315EKG_TYP1\r\n/);
});

test('Anfrage 6302 (CP1252) wird gelesen', () => {
  const buf = gdt.buildRecord('6302', [
    ['8315', 'ECHOBEF'], ['8316', 'EOSWIN'], ['9206', '3'], ['9218', '02.10'], ['3000', '4711'],
    ['3101', 'Müller'], ['3102', 'Jürgen'], ['3103', '24121960'], ['3110', '1'], ['3622', '182'], ['3623', '090'], ['8402', 'SONO00'],
  ], '3');
  const [rec] = gdt.parse(buf);
  const req = gdt.toRequest(rec);
  assert.equal(req.type, 'untersuchung');
  assert.equal(req.charset, '3');
  assert.deepEqual(req.patient, { patId: '4711', name: 'Müller', vorname: 'Jürgen', geburtsdatum: '1960-12-24', sex: 'm' });
  assert.equal(req.groesse, 182);
  assert.equal(req.gewicht, 90);
});

test('Parser toleriert LF-Zeilenenden und mehrere Sätze', () => {
  const a = gdt.buildRecord('6301', [['3000', '1'], ['3101', 'A']], '2');
  const b = gdt.buildRecord('6311', [['3000', '2'], ['3101', 'B']], '2');
  const recs = gdt.parse(Buffer.from(Buffer.concat([a, b]).toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));
  assert.deepEqual(recs.map((r) => [r.satzart, r.get('3000')]), [['6301', '1'], ['6311', '2']]);
});

test('Zeilenumbruch auf max. 60 Zeichen mit Absätzen', () => {
  const lines = gdt.wrapText('Linker Ventrikel: ' + 'normal groß '.repeat(10) + '\n\nZweiter Absatz.', 60);
  assert.ok(lines.every((l) => l.length <= 60));
  assert.ok(lines.includes(''));
  assert.equal(lines.at(-1), 'Zweiter Absatz.');
});

test('Ergebnis 6310 mit Befundtext, Messwerten und PDF-Verweis', () => {
  const buf = gdt.buildResult({
    patient: { patId: '4711', name: 'Müller', vorname: 'Jürgen', geburtsdatum: '1960-12-24', sex: 'm', datum: '2026-09-13', untersucher: 'Dr. X' },
    reportText: 'Normal großer linker Ventrikel (LVEDD 50 mm).',
    measures: [{ id: 'LVEDD', label: 'LVEDD', value: 50, unit: 'mm' }],
    pdfPath: 'C:\\GDT\\Echo_4711.pdf',
    now: new Date(2026, 8, 13, 14, 5, 9),
  }, { ownId: 'ECHOBEF', pvsId: 'EOSWIN', charset: '3', testType: 'SONO00', textField: '6228', lineWidth: 60, sendMeasures: true });

  const [rec] = gdt.parse(buf);
  assert.equal(rec.satzart, '6310');
  assert.equal(Number(rec.get('8100')), buf.length);
  assert.equal(rec.get('8315'), 'EOSWIN');
  assert.equal(rec.get('3103'), '24121960');
  assert.equal(rec.get('6200'), '13092026');
  assert.equal(rec.get('6201'), '140509');
  assert.equal(rec.all('6228').join(' '), 'Normal großer linker Ventrikel (LVEDD 50 mm).');
  assert.equal(rec.get('6305'), 'C:\\GDT\\Echo_4711.pdf');
  assert.deepEqual([rec.get('8410'), rec.get('8420'), rec.get('8421')], ['LVEDD', '50', 'mm']);
  assert.equal(rec.get('8990'), 'Dr. X');
});

test('Dateinamen: eingehend, fest und hochzählend', () => {
  const re = gdt.incomingPattern('ECHO', 'EDV1');
  assert.ok(re.test('ECHOEDV1.GDT'));
  assert.ok(re.test('echoedv1.007'));
  assert.ok(!re.test('EDV1ECHO.GDT'));
  assert.equal(gdt.outgoingName('ECHO', 'EDV1', 'fixed', []), 'EDV1ECHO.GDT');
  assert.equal(gdt.outgoingName('ECHO', 'EDV1', 'fixed', ['edv1echo.gdt']), null);
  assert.equal(gdt.outgoingName('ECHO', 'EDV1', 'counter', ['EDV1ECHO.001', 'EDV1ECHO.002', 'ECHOEDV1.009']), 'EDV1ECHO.003');
});

test('Ausgehende Dateien erkennen (für die Abhol-Warnung)', () => {
  const re = gdt.outgoingPattern('ECHO', 'EOSW');
  assert.ok(re.test('EOSWECHO.GDT'));
  assert.ok(re.test('eoswecho.012'));
  assert.ok(!re.test('ECHOEOSW.GDT'));
});

test('Ampel-Status: aus, ohne Ordner, nicht erreichbar, wartet, ok', () => {
  const now = 1_000_000;
  assert.deepEqual(gdt.evaluateStatus({ enabled: false }), { state: 'off' });
  assert.deepEqual(gdt.evaluateStatus({ enabled: true, dir: '' }), { state: 'unconfigured' });
  assert.deepEqual(gdt.evaluateStatus({ enabled: true, dir: 'C:\\GDT', dirReadable: false }), { state: 'unreachable' });
  // frisch gesendet → noch keine Warnung
  assert.deepEqual(gdt.evaluateStatus({ enabled: true, dir: 'C:\\GDT', dirReadable: true, outgoing: [{ name: 'EOSWECHO.GDT', mtime: now - 60_000 }], now }), { state: 'ok' });
  // länger als 2 Minuten liegen geblieben → gelb, älteste Datei wird genannt
  assert.deepEqual(
    gdt.evaluateStatus({ enabled: true, dir: 'C:\\GDT', dirReadable: true, outgoing: [{ name: 'EOSWECHO.002', mtime: now - 130_000 }, { name: 'EOSWECHO.001', mtime: now - 300_000 }], now }),
    { state: 'waiting', file: 'EOSWECHO.001', since: now - 300_000 },
  );
  // eigene Wartezeit
  assert.equal(gdt.evaluateStatus({ enabled: true, dir: 'x', dirReadable: true, outgoing: [{ name: 'a', mtime: now - 40_000 }], now, warnMs: 30_000 }).state, 'waiting');
});
