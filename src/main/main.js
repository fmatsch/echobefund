const { app, BrowserWindow, ipcMain, clipboard, dialog, shell, net } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const gdt = require('./gdt');
const dicomsr = require('./dicomsr');

// Separater Datenordner, z. B. für Tests oder einen zweiten Arbeitsplatz-Profil.
if (process.env.ECHOBEFUND_USER_DATA) app.setPath('userData', process.env.ECHOBEFUND_USER_DATA);

// Nur eine Instanz: Ein erneuter Aufruf aus der Praxissoftware holt das offene Fenster nach vorn.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let mainWindow = null;

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Atomar schreiben, damit bei Absturz keine halbe Datei entsteht.
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function archiveDir() {
  const settings = await readJson(settingsFile(), {});
  return settings.archiveDir || path.join(app.getPath('userData'), 'archiv');
}

function recordPath(dir, id) {
  if (!/^[a-zA-Z0-9-]+$/.test(String(id))) throw new Error('Ungültige Befund-ID');
  return path.join(dir, `${id}.json`);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    minWidth: 1000,
    minHeight: 700,
    title: 'Echobefund',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });
}

// ---------- GDT (Praxissoftware, z. B. EOSWIN) ----------

const GDT_POLL_MS = 1500;
const DIR_TIMEOUT_MS = 5000;
let gdtTimer = null;
let gdtBusy = false;
let rendererReady = false;
const gdtQueue = [];
let gdtStatus = { state: 'off' };

function setGdtStatus(status) {
  if (JSON.stringify(status) === JSON.stringify(gdtStatus)) return;
  gdtStatus = status;
  if (rendererReady && mainWindow) mainWindow.webContents.send('gdt:status', gdtStatus);
}

// Netzlaufwerke können bei Serverausfall lange hängen: nach `ms` als nicht erreichbar werten.
// Der hängende Aufruf blockiert weitere Abfragen (gdtBusy), bis Windows ihn selbst beendet.
async function readdirWithTimeout(dir, ms) {
  const pending = fs.readdir(dir);
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Zeitüberschreitung')), ms); });
  try {
    return await Promise.race([pending, timeout]);
  } catch (err) {
    await pending.catch(() => {});
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function gdtConfig() {
  const settings = await readJson(settingsFile(), {});
  return settings.gdt || {};
}

function deliverGdt() {
  if (!rendererReady || !mainWindow) return;
  while (gdtQueue.length) mainWindow.webContents.send('gdt:request', gdtQueue.shift());
}

// Liest an uns adressierte Dateien (FIFO nach Änderungszeit) und löscht sie danach (GDT 2.1, 2.3.1).
async function pollGdt() {
  if (gdtBusy) return;
  gdtBusy = true;
  try {
    const cfg = await gdtConfig();
    if (!cfg.enabled || !cfg.dir) {
      setGdtStatus(gdt.evaluateStatus({ enabled: cfg.enabled, dir: cfg.dir }));
      return;
    }
    let allNames;
    try {
      allNames = await readdirWithTimeout(cfg.dir, DIR_TIMEOUT_MS);
    } catch {
      // Ordner nicht erreichbar, z. B. Server aus oder Netzlaufwerk getrennt
      setGdtStatus(gdt.evaluateStatus({ enabled: true, dir: cfg.dir, dirReadable: false }));
      return;
    }
    const outPattern = gdt.outgoingPattern(cfg.ownShort, cfg.pvsShort);
    const outgoing = (await Promise.all(allNames.filter((n) => outPattern.test(n)).map(async (n) => {
      const stat = await fs.stat(path.join(cfg.dir, n)).catch(() => null);
      return stat && { name: n, mtime: stat.mtimeMs };
    }))).filter(Boolean);
    setGdtStatus(gdt.evaluateStatus({
      enabled: true,
      dir: cfg.dir,
      dirReadable: true,
      outgoing,
      warnMs: (Number(cfg.pickupWarnSeconds) || 120) * 1000,
    }));

    const pattern = gdt.incomingPattern(cfg.ownShort, cfg.pvsShort);
    const names = allNames.filter((n) => pattern.test(n));
    const files = await Promise.all(names.map(async (n) => {
      const file = path.join(cfg.dir, n);
      const stat = await fs.stat(file).catch(() => null);
      return stat && stat.isFile() ? { file, mtime: stat.mtimeMs, size: stat.size } : null;
    }));
    for (const f of files.filter(Boolean).sort((a, b) => a.mtime - b.mtime)) {
      // Datei wird evtl. noch geschrieben: nur verarbeiten, wenn die Größe stabil ist.
      await new Promise((r) => setTimeout(r, 150));
      const again = await fs.stat(f.file).catch(() => null);
      if (!again || again.size !== f.size) continue;
      const buf = await fs.readFile(f.file);
      const records = gdt.parse(buf);
      await fs.unlink(f.file).catch(() => {});
      for (const rec of records) gdtQueue.push({ ...gdt.toRequest(rec), file: path.basename(f.file) });
    }
    if (gdtQueue.length) {
      showWindow();
      deliverGdt();
    }
  } finally {
    gdtBusy = false;
  }
}

function restartGdt() {
  clearInterval(gdtTimer);
  gdtTimer = setInterval(pollGdt, GDT_POLL_MS);
  pollGdt();
}

async function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

const safeName = (s) => String(s || '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');

ipcMain.handle('gdt:ready', () => {
  rendererReady = true;
  deliverGdt();
  if (pendingUpdate && mainWindow) {
    mainWindow.webContents.send('update:available', pendingUpdate);
    pendingUpdate = null;
  }
  return gdtStatus;
});

// Öffnet die Online-Anleitung im Standardbrowser (nur diese Adresse, nur einfache Sprungmarken).
ipcMain.handle('open:guide', (_e, anchor) => {
  const hash = /^[a-z0-9-]{1,40}$/i.test(String(anchor || '')) ? `#${anchor}` : '';
  return shell.openExternal(`https://fmatsch.github.io/echobefund/anleitung/${hash}`);
});

ipcMain.handle('gdt:checkDir', async (_e, dir) => {
  try {
    const probe = path.join(dir, `echobefund-test-${process.pid}.tmp`);
    await fs.writeFile(probe, 'test');
    await fs.unlink(probe);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// data: { patient, reportText, measures, groesse, gewicht, charset, testType }
ipcMain.handle('gdt:send', async (e, data) => {
  const cfg = await gdtConfig();
  if (!cfg.enabled || !cfg.dir) return { ok: false, error: 'GDT ist nicht eingerichtet (Einstellungen → Praxissoftware).' };

  let existing;
  try {
    existing = await fs.readdir(cfg.dir);
  } catch {
    return { ok: false, error: `Austauschordner nicht erreichbar: ${cfg.dir}` };
  }
  const name = gdt.outgoingName(cfg.ownShort, cfg.pvsShort, cfg.fileMode, existing);
  if (!name) return { ok: false, error: 'Die vorherige Befunddatei wurde von der Praxissoftware noch nicht abgeholt.' };

  let pdfPath;
  if (cfg.attachPdf) {
    const pdfDir = cfg.pdfDir || cfg.dir;
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    pdfPath = path.join(pdfDir, `Echo_${safeName(data.patient.patId || data.patient.name)}_${stamp}.pdf`);
    try {
      await fs.mkdir(pdfDir, { recursive: true });
      const pdf = await e.sender.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 },
      });
      await writeFileAtomic(pdfPath, pdf);
    } catch (err) {
      return { ok: false, error: `PDF konnte nicht gespeichert werden: ${err.message}` };
    }
  }

  const charset = cfg.charset && cfg.charset !== 'auto' ? cfg.charset : data.charset || '2';
  const buf = gdt.buildResult({ ...data, pdfPath }, {
    ownId: cfg.ownId,
    pvsId: cfg.pvsId,
    charset,
    testType: data.testType || cfg.testType,
    textField: cfg.textField,
    lineWidth: cfg.lineWidth,
    sendMeasures: cfg.sendMeasures,
  });
  const file = path.join(cfg.dir, name);
  await writeFileAtomic(file, buf);
  if (cfg.minimizeAfterSend && mainWindow) mainWindow.minimize();
  return { ok: true, file, pdfPath };
});

// ---------- Einstellungen ----------
ipcMain.handle('settings:load', () => readJson(settingsFile(), null));
ipcMain.handle('settings:save', async (_e, settings) => {
  await writeJson(settingsFile(), settings);
  restartGdt();
});

ipcMain.handle('settings:export', async (e, settings) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: 'echobefund-einstellungen.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  await writeJson(filePath, settings);
  return true;
});

ipcMain.handle('settings:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths.length) return null;
  return JSON.parse(await fs.readFile(filePaths[0], 'utf8'));
});

// ---------- Archiv ----------
ipcMain.handle('archive:dir', () => archiveDir());

ipcMain.handle('archive:chooseDir', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return canceled || !filePaths.length ? null : filePaths[0];
});

ipcMain.handle('archive:list', async () => {
  const dir = await archiveDir();
  let names = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const records = await Promise.all(names.map((n) => readJson(path.join(dir, n), null)));
  return records
    .filter((r) => r && r.id)
    .map(({ id, patient, created, updated }) => ({ id, patient, created, updated }))
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
});

ipcMain.handle('archive:load', async (_e, id) => readJson(recordPath(await archiveDir(), id), null));

ipcMain.handle('archive:save', async (_e, record) => {
  const now = new Date().toISOString();
  const saved = {
    ...record,
    id: record.id || crypto.randomUUID(),
    created: record.created || now,
    updated: now,
  };
  await writeJson(recordPath(await archiveDir(), saved.id), saved);
  return saved;
});

// In den Papierkorb verschieben statt endgültig zu löschen.
ipcMain.handle('archive:delete', async (_e, id) => {
  await shell.trashItem(recordPath(await archiveDir(), id));
  return true;
});

// ---------- Zwischenablage, PDF, Druck ----------
ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)));

ipcMain.handle('pdf:export', async (e, defaultName) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: defaultName || 'Echobefund.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return false;
  const data = await e.sender.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 },
  });
  await fs.writeFile(filePath, data);
  shell.openPath(filePath);
  return true;
});

ipcMain.handle('print', (e) =>
  new Promise((resolve) => e.sender.print({ printBackground: true }, (ok) => resolve(ok)))
);

// ---------- Vorbefund ----------
// Sucht den letzten archivierten Befund desselben Patienten (Patientennummer, sonst Name + Geburtsdatum).
ipcMain.handle('archive:findPrevious', async (_e, query) => {
  const dir = await archiveDir();
  let names;
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'));
  } catch {
    return null;
  }
  const norm = (s) => String(s || '').trim().toLowerCase();
  const p = (query && query.patient) || {};
  const matches = (rp) => {
    if (norm(p.patId) && norm(rp.patId)) return norm(p.patId) === norm(rp.patId);
    return !!(norm(p.name) && p.geburtsdatum && norm(p.name) === norm(rp.name)
      && norm(p.vorname) === norm(rp.vorname) && p.geburtsdatum === rp.geburtsdatum);
  };
  let best = null;
  for (const n of names) {
    const r = await readJson(path.join(dir, n), null);
    if (!r || !r.id || r.id === query.excludeId || !matches(r.patient || {})) continue;
    const d = (r.patient && r.patient.datum) || '';
    if (query.beforeDate && d > query.beforeDate) continue;
    const bd = best ? best.patient.datum || '' : '';
    if (!best || d > bd || (d === bd && String(r.updated) > String(best.updated))) best = r;
  }
  return best && { id: best.id, datum: best.patient.datum, patient: best.patient, values: best.values, assess: best.assess, reportText: best.reportText };
});

// ---------- DICOM-SR-Import ----------
ipcMain.handle('sr:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'DICOM-SR-Dateien vom Echogerät wählen',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'DICOM', extensions: ['dcm', 'DCM', 'sr', 'SR'] }, { name: 'Alle Dateien', extensions: ['*'] }],
  });
  if (canceled || !filePaths.length) return null;
  const results = [];
  for (const file of filePaths) {
    try {
      const stat = await fs.stat(file);
      if (stat.size > 50 * 1024 * 1024) throw new Error('Datei zu groß für einen Messwertbericht');
      results.push({ file: path.basename(file), ...dicomsr.readStructuredReport(await fs.readFile(file)) });
    } catch (err) {
      results.push({ file: path.basename(file), error: err.message });
    }
  }
  return results;
});

// ---------- Gemeinsames Profil (Mehrplatz) ----------
const validProfilePath = (p) => typeof p === 'string' && /\.json$/i.test(p);

ipcMain.handle('profile:choose', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Ordner für das gemeinsame Profil wählen (z. B. auf dem Praxis-Server)',
    properties: ['openDirectory', 'createDirectory'],
  });
  return canceled || !filePaths.length ? null : path.join(filePaths[0], 'echobefund-profil.json');
});

ipcMain.handle('profile:read', async (_e, file) => {
  if (!validProfilePath(file)) return { ok: false, error: 'Ungültiger Pfad' };
  try {
    return { ok: true, data: JSON.parse(await fs.readFile(file, 'utf8')) };
  } catch (err) {
    return { ok: false, missing: err.code === 'ENOENT', error: err.message };
  }
});

// Schreibt das Profil nur, wenn es seit dem letzten Lesen nicht an einem anderen Platz geändert wurde.
ipcMain.handle('profile:write', async (_e, file, data, expectedStamp, force) => {
  if (!validProfilePath(file)) return { ok: false, error: 'Ungültiger Pfad' };
  const current = await readJson(file, null);
  if (!force && current && current.stamp && current.stamp !== expectedStamp) return { ok: false, conflict: true, current };
  const saved = { ...data, stamp: new Date().toISOString(), savedBy: os.hostname() };
  try {
    await writeJson(file, saved);
    return { ok: true, stamp: saved.stamp };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---------- Update-Hinweis ----------
// Fragt höchstens einmal täglich bei GitHub nach der neuesten Version. Es werden keine Patientendaten übertragen.
const REPO = 'fmatsch/echobefund';
const DAY_MS = 24 * 60 * 60 * 1000;
let pendingUpdate = null;
const updateFile = () => path.join(app.getPath('userData'), 'update-check.json');

function newerVersion(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function checkForUpdate(force) {
  const current = app.getVersion();
  const settings = await readJson(settingsFile(), {});
  if (!force && settings.updates && settings.updates.check === false) return { status: 'disabled', current };
  const last = await readJson(updateFile(), {});
  if (!force && last.checkedAt && Date.now() - last.checkedAt < DAY_MS && last.result) {
    const r = last.result;
    if (r.status === 'available' && !newerVersion(r.version, current)) return { status: 'current', version: r.version, current };
    return { ...r, current };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Echobefund/${current}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GitHub antwortet mit ${res.status}`);
    const release = await res.json();
    const version = String(release.tag_name || '').replace(/^v/, '');
    const url = String(release.html_url || '');
    const result = newerVersion(version, current) && url.startsWith(`https://github.com/${REPO}/`)
      ? { status: 'available', version, url }
      : { status: 'current', version };
    await writeJson(updateFile(), { checkedAt: Date.now(), result });
    return { ...result, current };
  } catch (err) {
    return { status: 'error', error: err.name === 'AbortError' ? 'Zeitüberschreitung' : err.message, current };
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('update:check', () => checkForUpdate(true));
ipcMain.handle('open:release', (_e, url) => {
  if (typeof url === 'string' && url.startsWith(`https://github.com/${REPO}/`)) return shell.openExternal(url);
  return false;
});

app.on('second-instance', () => {
  showWindow();
  pollGdt();
});

app.whenReady().then(() => {
  createWindow();
  restartGdt();
  setTimeout(async () => {
    const result = await checkForUpdate(false);
    if (result.status !== 'available') return;
    if (rendererReady && mainWindow) mainWindow.webContents.send('update:available', result);
    else pendingUpdate = result;
  }, 4000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
