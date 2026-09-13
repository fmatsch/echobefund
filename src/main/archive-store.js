// Befundarchiv mit optionaler Verschlüsselung.
//
// Aufbau:
// - Jeder Befund ist eine Datei <id>.json – unverschlüsselt als JSON oder verschlüsselt als Umschlag
//   { format, keyId, iv, tag, ct } (AES-256-GCM, die Befund-ID ist als Zusatzdaten authentifiziert).
// - Der eigentliche Archivschlüssel (zufällig, 256 Bit) liegt nie im Klartext auf der Platte. In der
//   Schlüsseldatei im Archivordner ist er zweifach eingepackt: mit dem Wiederherstellungscode und – falls
//   gesetzt – mit dem Passwort (jeweils scrypt + AES-256-GCM).
// - Auf diesem Gerät kann der Archivschlüssel zusätzlich über das Betriebssystem geschützt gespeichert
//   werden (macOS-Schlüsselbund bzw. Windows DPAPI). Dann wird ohne Passwort entsperrt.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const KEY_FILE = '.echobefund-schluessel.json';
const KEY_FORMAT = 'echobefund-schluessel-v1';
const RECORD_FORMAT = 'echobefund-archiv-v1';
const DEFAULT_KDF = { N: 2 ** 17, r: 8, p: 1 };
const MIN_PASSWORD = 8;

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => Buffer.from(String(s), 'base64');

class ArchiveError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}
const locked = () => new ArchiveError('ARCHIVE_LOCKED', 'ARCHIVE_LOCKED: Das Archiv ist verschlüsselt und gesperrt.');

function scrypt(secret, salt, { N, r, p }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(secret).normalize('NFC'), salt, 32, { N, r, p, maxmem: 512 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function seal(key, plaintext, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv: b64(iv), tag: b64(cipher.getAuthTag()), ct: b64(ct) };
}

function unseal(key, box, aad) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, unb64(box.iv));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(unb64(box.tag));
  return Buffer.concat([decipher.update(unb64(box.ct)), decipher.final()]);
}

// Wiederherstellungscode: 160 Bit Zufall, Crockford-Base32, in Vierergruppen (gut abzutippen)
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function newRecoveryCode() {
  let bits = '';
  for (const byte of crypto.randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < 160; i += 5) out += CROCKFORD[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g).join('-');
}
function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
}

async function wrapKey(dataKey, secret, kdf, keyId) {
  const salt = crypto.randomBytes(16);
  const kek = await scrypt(secret, salt, kdf);
  return { kdf: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, salt: b64(salt), ...seal(kek, dataKey, keyId) };
}

async function unwrapKey(wrap, secret, keyId) {
  if (!wrap) return null;
  const kek = await scrypt(secret, unb64(wrap.salt), wrap);
  try {
    return unseal(kek, wrap, keyId);
  } catch {
    return null; // falsches Passwort bzw. falscher Code
  }
}

async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

const isEnvelope = (o) => !!o && o.format === RECORD_FORMAT;

class ArchiveStore {
  // getDir: () => Promise<string>  Archivordner
  // device: { available(), get(name), set(name, key), remove(name) }  geschützter Speicher dieses Geräts
  // trash:  (file) => Promise       Datei in den Papierkorb
  constructor({ getDir, device, trash, kdf = DEFAULT_KDF }) {
    this.getDir = getDir;
    this.device = device;
    this.trash = trash;
    this.kdf = kdf;
    this.key = null;
    this.keyDir = null;
  }

  async dir() {
    const dir = await this.getDir();
    if (dir !== this.keyDir) {
      this.key = null; // anderer Archivordner → Schlüssel verwerfen
      this.keyDir = dir;
    }
    return dir;
  }

  recordPath(dir, id) {
    if (!/^[a-zA-Z0-9-]+$/.test(String(id))) throw new ArchiveError('INVALID_ID', 'Ungültige Befund-ID');
    return path.join(dir, `${id}.json`);
  }

  async readKeyFile(dir) {
    try {
      const kf = JSON.parse(await fs.readFile(path.join(dir, KEY_FILE), 'utf8'));
      if (kf.format !== KEY_FORMAT) throw new ArchiveError('KEYFILE', 'Unbekanntes Format der Schlüsseldatei');
      return kf;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  deviceName(dir, keyId) {
    return crypto.createHash('sha256').update(`${path.resolve(dir)}|${keyId}`).digest('hex').slice(0, 40);
  }

  // Liefert { dir, kf, key }. key ist null bei unverschlüsseltem Archiv; wirft ARCHIVE_LOCKED, wenn gesperrt.
  async context() {
    const dir = await this.dir();
    const kf = await this.readKeyFile(dir);
    if (!kf) return { dir, kf: null, key: null };
    if (!this.key && this.device.available()) {
      const stored = await this.device.get(this.deviceName(dir, kf.keyId));
      if (stored && stored.length === 32) this.key = stored;
    }
    if (!this.key) throw locked();
    return { dir, kf, key: this.key };
  }

  async recordFiles(dir) {
    try {
      return (await fs.readdir(dir)).filter((n) => n.endsWith('.json') && !n.startsWith('.'));
    } catch {
      return [];
    }
  }

  async readRecordFile(ctx, file) {
    let raw;
    try {
      raw = JSON.parse(await fs.readFile(path.join(ctx.dir, file), 'utf8'));
    } catch {
      return null;
    }
    if (!isEnvelope(raw)) return raw;
    if (!ctx.kf) throw new ArchiveError('KEYFILE_MISSING', 'Verschlüsselte Befunde gefunden, aber die Schlüsseldatei fehlt im Archivordner.');
    if (raw.keyId !== ctx.kf.keyId) throw new ArchiveError('WRONG_KEY', 'Befund wurde mit einem anderen Schlüssel verschlüsselt.');
    const id = path.basename(file, '.json');
    return JSON.parse(unseal(ctx.key, raw, id).toString('utf8'));
  }

  async writeRecord(ctx, record) {
    const file = this.recordPath(ctx.dir, record.id);
    const data = ctx.key
      ? JSON.stringify({ format: RECORD_FORMAT, keyId: ctx.kf.keyId, ...seal(ctx.key, Buffer.from(JSON.stringify(record)), record.id) })
      : JSON.stringify(record, null, 2);
    await writeAtomic(file, data);
  }

  // ---------- Befunde ----------

  async readAll(ctx) {
    const out = [];
    for (const file of await this.recordFiles(ctx.dir)) {
      try {
        const r = await this.readRecordFile(ctx, file);
        if (r && r.id) out.push(r);
      } catch {
        // beschädigte oder fremd verschlüsselte Datei überspringen
      }
    }
    return out;
  }

  async list() {
    const ctx = await this.context();
    return (await this.readAll(ctx))
      .map(({ id, patient, created, updated }) => ({ id, patient, created, updated }))
      .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  }

  async load(id) {
    const ctx = await this.context();
    const file = path.basename(this.recordPath(ctx.dir, id));
    return this.readRecordFile(ctx, file);
  }

  async save(record) {
    const ctx = await this.context();
    const now = new Date().toISOString();
    const saved = { ...record, id: record.id || crypto.randomUUID(), created: record.created || now, updated: now };
    await this.writeRecord(ctx, saved);
    return saved;
  }

  async remove(id) {
    const dir = await this.dir();
    await this.trash(this.recordPath(dir, id));
    return true;
  }

  // Letzter Befund desselben Patienten (Patientennummer, sonst Name + Geburtsdatum)
  async findPrevious(query) {
    const ctx = await this.context();
    const norm = (s) => String(s || '').trim().toLowerCase();
    const p = (query && query.patient) || {};
    const matches = (rp) => {
      if (norm(p.patId) && norm(rp.patId)) return norm(p.patId) === norm(rp.patId);
      return !!(norm(p.name) && p.geburtsdatum && norm(p.name) === norm(rp.name)
        && norm(p.vorname) === norm(rp.vorname) && p.geburtsdatum === rp.geburtsdatum);
    };
    let best = null;
    for (const r of await this.readAll(ctx)) {
      if (r.id === query.excludeId || !matches(r.patient || {})) continue;
      const d = (r.patient && r.patient.datum) || '';
      if (query.beforeDate && d > query.beforeDate) continue;
      const bd = best ? best.patient.datum || '' : '';
      if (!best || d > bd || (d === bd && String(r.updated) > String(best.updated))) best = r;
    }
    return best && { id: best.id, datum: best.patient.datum, patient: best.patient, values: best.values, assess: best.assess, reportText: best.reportText };
  }

  // ---------- Verschlüsselung ----------

  async status() {
    const dir = await this.dir();
    const kf = await this.readKeyFile(dir);
    const deviceAvailable = this.device.available();
    if (!kf) return { encrypted: false, unlocked: true, hasPassword: false, remembered: false, deviceAvailable, dir };
    let unlocked = true;
    try { await this.context(); } catch (err) { if (err.code !== 'ARCHIVE_LOCKED') throw err; unlocked = false; }
    const remembered = deviceAvailable && !!(await this.device.get(this.deviceName(dir, kf.keyId)));
    return { encrypted: true, unlocked, hasPassword: !!kf.password, remembered, deviceAvailable, dir, created: kf.created };
  }

  validatePassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      throw new ArchiveError('WEAK_PASSWORD', `Das Passwort muss mindestens ${MIN_PASSWORD} Zeichen lang sein.`);
    }
  }

  async rememberOnDevice(dir, kf, key, remember) {
    if (!this.device.available()) return;
    const name = this.deviceName(dir, kf.keyId);
    if (!kf.password || remember) await this.device.set(name, key);
    else await this.device.remove(name);
  }

  // Schaltet die Verschlüsselung ein und verschlüsselt vorhandene Befunde. Liefert den Wiederherstellungscode.
  async enable({ password = null, remember = false } = {}) {
    const dir = await this.dir();
    if (await this.readKeyFile(dir)) throw new ArchiveError('ALREADY_ENCRYPTED', 'Das Archiv ist bereits verschlüsselt.');
    if (password) this.validatePassword(password);
    else if (!this.device.available()) {
      throw new ArchiveError('NO_DEVICE_STORE', 'Auf diesem Gerät ist kein geschützter Schlüsselspeicher verfügbar – bitte ein Passwort festlegen.');
    }
    await fs.mkdir(dir, { recursive: true });
    const plainCtx = { dir, kf: null, key: null };
    const existing = await this.readAll(plainCtx);

    const key = crypto.randomBytes(32);
    const keyId = crypto.randomBytes(8).toString('hex');
    const recoveryCode = newRecoveryCode();
    const kf = {
      format: KEY_FORMAT,
      keyId,
      created: new Date().toISOString(),
      recovery: await wrapKey(key, normalizeRecoveryCode(recoveryCode), this.kdf, keyId),
      password: password ? await wrapKey(key, password, this.kdf, keyId) : null,
    };
    // Reihenfolge: erst Schlüssel sichern, dann Befunde umschreiben (jede Datei atomar)
    await writeAtomic(path.join(dir, KEY_FILE), JSON.stringify(kf, null, 2));
    this.key = key;
    await this.rememberOnDevice(dir, kf, key, remember);
    const ctx = { dir, kf, key };
    for (const record of existing) await this.writeRecord(ctx, record);
    return { recoveryCode, migrated: existing.length };
  }

  async unlock({ password, recoveryCode, remember = false } = {}) {
    const dir = await this.dir();
    const kf = await this.readKeyFile(dir);
    if (!kf) return this.status();
    let key = null;
    if (password) key = await unwrapKey(kf.password, password, kf.keyId);
    else if (recoveryCode) key = await unwrapKey(kf.recovery, normalizeRecoveryCode(recoveryCode), kf.keyId);
    if (!key) {
      throw new ArchiveError('WRONG_SECRET', password ? 'Das Passwort ist falsch.' : 'Der Wiederherstellungscode ist falsch.');
    }
    this.key = key;
    await this.rememberOnDevice(dir, kf, key, remember || !!recoveryCode && !kf.password);
    return this.status();
  }

  // Passwort setzen, ändern (password) oder entfernen (password = null)
  async setPassword({ password = null, remember = false } = {}) {
    const ctx = await this.context();
    if (!ctx.kf) throw new ArchiveError('NOT_ENCRYPTED', 'Das Archiv ist nicht verschlüsselt.');
    if (password) this.validatePassword(password);
    else if (!this.device.available()) {
      throw new ArchiveError('NO_DEVICE_STORE', 'Ohne geschützten Schlüsselspeicher kann das Passwort nicht entfernt werden.');
    }
    const kf = { ...ctx.kf, password: password ? await wrapKey(ctx.key, password, this.kdf, ctx.kf.keyId) : null };
    await writeAtomic(path.join(ctx.dir, KEY_FILE), JSON.stringify(kf, null, 2));
    await this.rememberOnDevice(ctx.dir, kf, ctx.key, remember);
    return this.status();
  }

  async renewRecoveryCode() {
    const ctx = await this.context();
    if (!ctx.kf) throw new ArchiveError('NOT_ENCRYPTED', 'Das Archiv ist nicht verschlüsselt.');
    const recoveryCode = newRecoveryCode();
    const kf = { ...ctx.kf, recovery: await wrapKey(ctx.key, normalizeRecoveryCode(recoveryCode), this.kdf, ctx.kf.keyId) };
    await writeAtomic(path.join(ctx.dir, KEY_FILE), JSON.stringify(kf, null, 2));
    return { recoveryCode };
  }

  // Entschlüsselt alle Befunde und entfernt die Schlüsseldatei.
  async disable() {
    const ctx = await this.context();
    if (!ctx.kf) return { decrypted: 0 };
    const records = [];
    for (const file of await this.recordFiles(ctx.dir)) {
      const r = await this.readRecordFile(ctx, file); // bei Fehlern abbrechen, bevor etwas verändert wird
      if (r && r.id) records.push(r);
    }
    const plain = { dir: ctx.dir, kf: null, key: null };
    for (const r of records) await this.writeRecord(plain, r);
    await this.device.remove(this.deviceName(ctx.dir, ctx.kf.keyId));
    await fs.unlink(path.join(ctx.dir, KEY_FILE));
    this.key = null;
    return { decrypted: records.length };
  }
}

module.exports = { ArchiveStore, ArchiveError, newRecoveryCode, normalizeRecoveryCode, KEY_FILE, RECORD_FORMAT, MIN_PASSWORD };
