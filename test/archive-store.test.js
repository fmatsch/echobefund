const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ArchiveStore, normalizeRecoveryCode, newRecoveryCode, KEY_FILE } = require('../src/main/archive-store');

const FAST_KDF = { N: 1024, r: 8, p: 1 }; // nur für Tests – die App nutzt deutlich stärkere Parameter

function memoryDevice() {
  const map = new Map();
  return { available: () => true, get: async (n) => map.get(n) || null, set: async (n, k) => { map.set(n, Buffer.from(k)); }, remove: async (n) => { map.delete(n); }, map };
}

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echobefund-archiv-'));
  const trashed = [];
  const make = (device) => new ArchiveStore({ getDir: async () => dir, device, trash: async (f) => { trashed.push(f); await fs.unlink(f); }, kdf: FAST_KDF });
  return { dir, make, trashed };
}

const patient = { patId: '4711', name: 'Müller', vorname: 'Jürgen', geburtsdatum: '1960-12-24', datum: '2025-03-12' };
const rejectsCode = (promise, code) => assert.rejects(promise, (err) => err.code === code);

test('Unverschlüsseltes Archiv: speichern, auflisten, laden, löschen', async () => {
  const { dir, make, trashed } = await setup();
  const store = make(memoryDevice());
  const saved = await store.save({ patient, values: { lvef: 55 } });
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.load(saved.id)).values.lvef, 55);
  assert.equal((await store.status()).encrypted, false);
  await store.remove(saved.id);
  assert.equal(trashed.length, 1);
  assert.deepEqual(await store.list(), []);
  await fs.rm(dir, { recursive: true });
});

test('Verschlüsselung ohne Passwort: vorhandene Befunde werden verschlüsselt, Neustart entsperrt automatisch', async () => {
  const { dir, make } = await setup();
  const device = memoryDevice();
  const store = make(device);
  const saved = await store.save({ patient, values: { lvef: 55 }, reportText: 'Geheimer Befundtext' });

  const { recoveryCode, migrated } = await store.enable();
  assert.equal(migrated, 1);
  assert.match(recoveryCode, /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);

  const raw = await fs.readFile(path.join(dir, `${saved.id}.json`), 'utf8');
  assert.doesNotMatch(raw, /Müller|4711|Geheimer/);
  const keyFile = await fs.readFile(path.join(dir, KEY_FILE), 'utf8');
  assert.doesNotMatch(keyFile, /Müller/);

  const restarted = make(device); // gleiches Gerät
  assert.equal((await restarted.load(saved.id)).reportText, 'Geheimer Befundtext');
  const st = await restarted.status();
  assert.deepEqual([st.encrypted, st.unlocked, st.hasPassword, st.remembered], [true, true, false, true]);

  // neuer Befund wird ebenfalls verschlüsselt gespeichert
  const second = await restarted.save({ patient: { ...patient, datum: '2026-01-10' }, values: { lvef: 42 } });
  assert.doesNotMatch(await fs.readFile(path.join(dir, `${second.id}.json`), 'utf8'), /Müller/);
  const prev = await restarted.findPrevious({ patient: { ...patient, datum: '2026-09-13' }, excludeId: null, beforeDate: '2026-09-13' });
  assert.equal(prev.values.lvef, 42);
  await fs.rm(dir, { recursive: true });
});

test('Anderer Arbeitsplatz: gesperrt, Entsperren mit Wiederherstellungscode (Tippfehler-tolerant)', async () => {
  const { dir, make } = await setup();
  const store = make(memoryDevice());
  const saved = await store.save({ patient });
  const { recoveryCode } = await store.enable();

  const other = make(memoryDevice()); // leerer Schlüsselspeicher
  await rejectsCode(other.list(), 'ARCHIVE_LOCKED');
  assert.equal((await other.status()).unlocked, false);
  await rejectsCode(other.unlock({ recoveryCode: newRecoveryCode() }), 'WRONG_SECRET');

  const sloppy = recoveryCode.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o');
  assert.equal(normalizeRecoveryCode(sloppy), normalizeRecoveryCode(recoveryCode));
  const st = await other.unlock({ recoveryCode: sloppy });
  assert.equal(st.unlocked, true);
  assert.equal(st.remembered, true, 'ohne Passwort wird der Schlüssel nach dem Entsperren gemerkt');
  assert.equal((await other.load(saved.id)).patient.name, 'Müller');
  await fs.rm(dir, { recursive: true });
});

test('Passwortschutz: Neustart verlangt Passwort, falsches Passwort wird abgelehnt, „merken“ entsperrt automatisch', async () => {
  const { dir, make } = await setup();
  const device = memoryDevice();
  const store = make(device);
  await store.save({ patient });
  await rejectsCode(store.enable({ password: 'kurz' }), 'WEAK_PASSWORD');
  await store.enable({ password: 'Herzecho-2026', remember: false });

  const restarted = make(device);
  await rejectsCode(restarted.list(), 'ARCHIVE_LOCKED');
  await rejectsCode(restarted.unlock({ password: 'falsch-falsch' }), 'WRONG_SECRET');
  await restarted.unlock({ password: 'Herzecho-2026' });
  assert.equal((await restarted.list()).length, 1);

  // Passwort ändern und merken
  await restarted.setPassword({ password: 'Neues-Passwort-1', remember: true });
  const again = make(device);
  assert.equal((await again.list()).length, 1);
  await rejectsCode(make(memoryDevice()).unlock({ password: 'Herzecho-2026' }), 'WRONG_SECRET');
  assert.equal((await make(memoryDevice()).unlock({ password: 'Neues-Passwort-1' })).unlocked, true);

  // Passwort entfernen → Gerät entsperrt ohne Passwort
  await again.setPassword({ password: null });
  const st = await make(device).status();
  assert.deepEqual([st.hasPassword, st.unlocked], [false, true]);
  await fs.rm(dir, { recursive: true });
});

test('Manipulation und vertauschte Dateien werden erkannt', async () => {
  const { dir, make } = await setup();
  const device = memoryDevice();
  const store = make(device);
  const a = await store.save({ patient, reportText: 'A' });
  const b = await store.save({ patient: { ...patient, patId: '9' }, reportText: 'B' });
  await store.enable();

  const fileA = path.join(dir, `${a.id}.json`);
  const env = JSON.parse(await fs.readFile(fileA, 'utf8'));
  const ct = Buffer.from(env.ct, 'base64');
  ct[0] ^= 0xff;
  await fs.writeFile(fileA, JSON.stringify({ ...env, ct: ct.toString('base64') }));
  await assert.rejects(store.load(a.id));

  // Datei von B unter dem Namen von A → Zusatzdaten (ID) passen nicht
  await fs.copyFile(path.join(dir, `${b.id}.json`), fileA);
  await assert.rejects(store.load(a.id));
  assert.equal((await store.list()).length, 1, 'beschädigte Datei wird in der Liste übersprungen');
  await fs.rm(dir, { recursive: true });
});

test('Neuer Wiederherstellungscode ersetzt den alten', async () => {
  const { dir, make } = await setup();
  const store = make(memoryDevice());
  const { recoveryCode: oldCode } = await store.enable();
  const { recoveryCode: newCode } = await store.renewRecoveryCode();
  await rejectsCode(make(memoryDevice()).unlock({ recoveryCode: oldCode }), 'WRONG_SECRET');
  assert.equal((await make(memoryDevice()).unlock({ recoveryCode: newCode })).unlocked, true);
  await fs.rm(dir, { recursive: true });
});

test('Verschlüsselung ausschalten entschlüsselt alle Befunde', async () => {
  const { dir, make } = await setup();
  const device = memoryDevice();
  const store = make(device);
  const saved = await store.save({ patient, reportText: 'Klartext' });
  await store.enable({ password: 'Herzecho-2026', remember: true });
  const { decrypted } = await store.disable();
  assert.equal(decrypted, 1);
  assert.match(await fs.readFile(path.join(dir, `${saved.id}.json`), 'utf8'), /Klartext/);
  await assert.rejects(fs.access(path.join(dir, KEY_FILE)));
  assert.equal(device.map.size, 0);
  assert.equal((await make(memoryDevice()).status()).encrypted, false);
  await fs.rm(dir, { recursive: true });
});

test('Ohne geschützten Gerätespeicher ist ein Passwort Pflicht', async () => {
  const { dir, make } = await setup();
  const store = make({ available: () => false, get: async () => null, set: async () => {}, remove: async () => {} });
  await rejectsCode(store.enable(), 'NO_DEVICE_STORE');
  await store.enable({ password: 'Herzecho-2026' });
  assert.equal((await store.status()).unlocked, true);
  await fs.rm(dir, { recursive: true });
});
