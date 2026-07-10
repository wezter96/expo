// Kinly desktop (Electron) main process.
//
// Loads the exported web build and provides the renderer a *secure key store*
// backed by Electron's safeStorage (OS keychain / DPAPI / libsecret) so
// end-to-end encryption keys can live safely on the desktop — the thing a plain
// browser tab cannot do. The renderer's secure-storage adapter talks to this
// over the `kinlySecureStore` bridge exposed in preload.js.
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const STORE_FILE = path.join(app.getPath('userData'), 'kinly-secure.json');

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function writeStore(obj) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(obj), { mode: 0o600 });
}

// Encrypt each value with the OS-backed key before it touches disk.
ipcMain.handle('secure:get', (_e, key) => {
  const store = readStore();
  const enc = store[key];
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return null;
  }
});
ipcMain.handle('secure:set', (_e, key, value) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS secure storage unavailable');
  const store = readStore();
  store[key] = safeStorage.encryptString(String(value)).toString('base64');
  writeStore(store);
});
ipcMain.handle('secure:delete', (_e, key) => {
  const store = readStore();
  delete store[key];
  writeStore(store);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 860,
    minWidth: 360,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'web-dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
