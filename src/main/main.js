const { app, BrowserWindow } = require('electron');
const path = require('path');
const log = require('electron-log');
const { initializeDatabase } = require('./storage/database');
const { registerIpcHandlers } = require('./ipc/handlers');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 740,
    title: 'FleetDesk',
    show: false,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.maximize();
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function createErrorWindow(error) {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 520,
    title: 'FleetDesk - Datenbankfehler',
    backgroundColor: '#111827',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  const message = String(error?.message || error || 'Unbekannter Fehler');
  const html = `<!doctype html><html lang="de" data-bs-theme="dark"><head><meta charset="utf-8"><title>FleetDesk Fehler</title><style>body{font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:2rem}.card{background:#111827;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:1.5rem;box-shadow:0 16px 40px rgba(0,0,0,.3)}code{display:block;white-space:pre-wrap;background:#020617;color:#fecaca;padding:1rem;border-radius:12px;margin-top:1rem}h1{margin-top:0;color:#fca5a5}</style></head><body><div class="card"><h1>FleetDesk konnte nicht gestartet werden</h1><p>Die Datenbank oder ein natives Modul konnte nicht geladen werden. Fuehre im Projektordner <strong>npm install</strong> aus. Falls der Fehler danach bestehen bleibt, fuehre <strong>npm rebuild better-sqlite3 --runtime=electron --target=31.7.7 --dist-url=https://electronjs.org/headers</strong> aus.</p><code>${escapeHtml(message)}</code></div></body></html>`;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

app.whenReady().then(() => {
  try {
    const database = initializeDatabase(app.getPath('userData'));
    registerIpcHandlers(database, mainWindow);
    createWindow();
  } catch (error) {
    log.error(error);
    createErrorWindow(error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

process.on('unhandledRejection', (error) => {
  log.error(error);
});

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
