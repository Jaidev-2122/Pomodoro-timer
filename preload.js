// =============================================================
// Preload script
//
// Runs in a privileged context BEFORE the renderer's own JS does.
// It exposes a small, curated API to the renderer via contextBridge.
// Because contextIsolation is on in main.js, this is the ONLY way
// the renderer can talk to the main process — which means there's
// no way for a remote script (e.g. Spotify SDK) to suddenly get
// access to the filesystem.
// =============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Renderer pushes its timer state up so the main process can update
  // the tray, the dock badge, and the floating widget window.
  sendTimerState: (state) => ipcRenderer.send('state', state),

  // Open / close the floating widget (the Electron version of the
  // in-page "Pop out" button).
  openWidget:  () => ipcRenderer.send('widget-open'),
  closeWidget: () => ipcRenderer.send('widget-close'),

  // The widget window sends user actions (Pause, Reset, Skip)
  // through the main process — they end up back at the main window
  // via this listener.
  onAction: (callback) => ipcRenderer.on('action', (_e, action) => callback(action)),

  // Auto-launch on login.
  setAutoLaunch:    (enabled) => ipcRenderer.send('auto-launch', enabled),
  getAutoLaunch:    ()        => ipcRenderer.invoke('auto-launch-status'),

  // Native notification.
  notify: ({ title, body }) => ipcRenderer.send('notify', { title, body }),

  // For the widget.html page: receive state updates from main.
  onState: (callback) => ipcRenderer.on('state', (_e, state) => callback(state)),

  // For the widget.html page: send actions back up.
  sendAction: (action) => ipcRenderer.send('widget-action', action),

  // Tells the renderer whether we're running inside Electron at all.
  // The same index.html runs in both the browser and Electron; this
  // flag lets it pick the right behaviour.
  isElectron: true,
  platform: process.platform
});
