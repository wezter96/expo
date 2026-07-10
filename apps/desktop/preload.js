// Exposes a minimal, safe secure-storage bridge to the renderer. The web
// bundle's secure-storage adapter (see apps/native/src/crypto/secure-store.web
// integration in DESKTOP.md) detects `window.kinlySecureStore` and uses it so
// E2EE identity keys are stored via the OS keychain instead of a browser store.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kinlySecureStore', {
  getItem: (key) => ipcRenderer.invoke('secure:get', key),
  setItem: (key, value) => ipcRenderer.invoke('secure:set', key, value),
  deleteItem: (key) => ipcRenderer.invoke('secure:delete', key),
  available: true,
});
