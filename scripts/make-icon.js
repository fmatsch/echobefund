// Rendert build/icon.svg zu build/icon.png (1024×1024). Aufruf: npm run icon
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setZoomFactor(1);
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, img.resize({ width: 1024, height: 1024 }).toPNG());
  console.log('geschrieben:', out, img.getSize());
  app.quit();
});
