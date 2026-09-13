const { app, BrowserWindow, ipcMain, clipboard, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const gdt = require('./gdt');

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

app.on('second-instance', () => {
  showWindow();
  pollGdt();
});

app.whenReady().then(() => {
  createWindow();
  restartGdt();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
