const { app, BrowserWindow, ipcMain, clipboard, dialog, shell, net, safeStorage } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const gdt = require('./gdt');
const dicomsr = require('./dicomsr');
const { ArchiveStore } = require('./archive-store');

// Separater Datenordner, z. B. für Tests oder einen zweiten Arbeitsplatz-Profil.
if (process.env.ECHOBEFUND_USER_DATA) app.setPath('userData', process.env.ECHOBEFUND_USER_DATA);

// Nur eine Instanz: Ein erneuter Aufruf aus der Praxissoftware holt das offene Fenster nach vorn.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let mainWindow = null;

// Herz-Icon für Fenster und (beim Start aus dem Quellcode) das macOS-Dock
const APP_ICON = path.join(__dirname, '..', 'assets', 'icon.png');

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

// Archivschlüssel dieses Geräts, geschützt durch das Betriebssystem (macOS-Schlüsselbund, Windows DPAPI)
const deviceKeyDir = () => path.join(app.getPath('userData'), 'schluessel');
const deviceKeys = {
  available: () => safeStorage.isEncryptionAvailable(),
  async get(name) {
    try {
      const encrypted = await fs.readFile(path.join(deviceKeyDir(), name));
      return Buffer.from(safeStorage.decryptString(encrypted), 'base64');
    } catch {
      return null;
    }
  },
  async set(name, key) {
    await fs.mkdir(deviceKeyDir(), { recursive: true });
    await writeFileAtomic(path.join(deviceKeyDir(), name), safeStorage.encryptString(Buffer.from(key).toString('base64')));
  },
  async remove(name) {
    await fs.unlink(path.join(deviceKeyDir(), name)).catch(() => {});
  },
};

const archive = new ArchiveStore({
  getDir: archiveDir,
  device: deviceKeys,
  trash: (file) => shell.trashItem(file), // in den Papierkorb statt endgültig löschen
});

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
    icon: APP_ICON,
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

// Ist das Archiv verschlüsselt und gesperrt, werfen diese Aufrufe „ARCHIVE_LOCKED“ – die Oberfläche fragt dann nach Passwort/Code.
ipcMain.handle('archive:list', () => archive.list());
ipcMain.handle('archive:load', (_e, id) => archive.load(id));
ipcMain.handle('archive:save', (_e, record) => archive.save(record));
ipcMain.handle('archive:delete', (_e, id) => archive.remove(id));
ipcMain.handle('archive:findPrevious', (_e, query) => archive.findPrevious(query));

// ---------- Archiv-Verschlüsselung ----------
ipcMain.handle('archive:security:status', () => archive.status());
ipcMain.handle('archive:security:enable', (_e, opts) => archive.enable(opts));
ipcMain.handle('archive:security:unlock', (_e, opts) => archive.unlock(opts));
ipcMain.handle('archive:security:setPassword', (_e, opts) => archive.setPassword(opts));
ipcMain.handle('archive:security:renewRecovery', () => archive.renewRecoveryCode());
ipcMain.handle('archive:security:disable', () => archive.disable());

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
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(APP_ICON);
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
