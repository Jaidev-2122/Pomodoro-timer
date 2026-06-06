// =============================================================
// Tempo — Electron main process
//
// This file runs in Node, not in a browser. It owns the lifecycle
// of the app: creating windows, the tray icon, native menus, and
// handling messages from the renderer process via IPC.
//
// Two windows exist:
//   - mainWindow   : the full app (index.html)
//   - widgetWindow : a small frameless always-on-top panel
//                    (widget.html) that floats above everything
// =============================================================

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, globalShortcut, Notification } = require('electron');
const path = require('path');

// Single-instance lock: if the user tries to launch Tempo while
// it's already running, focus the existing window instead of
// opening a second copy.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;
let widgetWindow = null;
let tray = null;

// Last known timer state, pushed up from the renderer. The widget
// window reads this whenever it (re-)opens so it doesn't show stale
// data, and the tray tooltip uses it for at-a-glance info.
let lastState = {
  mode: 'pomodoro',
  running: false,
  timeStr: '25:00',
  label: 'Focus'
};

// On macOS, dock badge text needs to be updated explicitly.
function updateDockBadge() {
  if (process.platform !== 'darwin') return;
  if (lastState.running) {
    app.dock.setBadge(lastState.timeStr);
  } else {
    app.dock.setBadge('');
  }
}

// =============================================================
// MAIN WINDOW
// =============================================================

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#14110f',
    title: 'Tempo',
    show: false,                  // wait until ready-to-show to avoid white flash
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,     // security: renderer cannot see Node directly
      nodeIntegration: false,
      sandbox: false              // preload needs a tiny bit of Node access
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Hide instead of quit on close (so the timer keeps running in the tray).
  // The user can still fully quit from the tray or the menu.
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      // On macOS, hiding the last window doesn't normally quit the app, but
      // we also dock-hide if the user has no tray icon enabled to keep things tidy.
    }
  });

  // External links should open in the user's default browser, not in the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// =============================================================
// FLOATING WIDGET WINDOW
//
// A small frameless always-on-top window. It loads widget.html,
// which is a tiny standalone HTML file that mirrors the in-app
// floater's design. It receives timer-state updates over IPC and
// can send back actions (start/pause/reset/skip) which we forward
// to the main window.
// =============================================================

function createWidgetWindow() {
  if (widgetWindow) {
    widgetWindow.show();
    return;
  }
  widgetWindow = new BrowserWindow({
    width: 280,
    height: 230,
    minWidth: 240,
    minHeight: 200,
    maxWidth: 400,
    maxHeight: 320,
    backgroundColor: '#00000000',     // transparent so rounded corners look right
    transparent: true,
    frame: false,                     // no native title bar
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,                // don't show in taskbar/dock
    alwaysOnTop: true,
    fullscreenable: false,
    title: 'Tempo Widget',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // On macOS, "floating" level keeps it above regular windows but below
  // full-screen apps. "screen-saver" puts it above everything including
  // full-screen apps — usually what users want for a timer.
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  widgetWindow.loadFile('widget.html');

  // Push the last known state in as soon as the widget is ready.
  widgetWindow.webContents.on('did-finish-load', () => {
    widgetWindow.webContents.send('state', lastState);
  });

  widgetWindow.on('closed', () => { widgetWindow = null; });
}

function destroyWidgetWindow() {
  if (widgetWindow) {
    widgetWindow.destroy();
    widgetWindow = null;
  }
}

// =============================================================
// TRAY ICON
// =============================================================

function getIconPath() {
  // The icon files don't have to exist for the app to run — Electron will
  // just use a default icon if they're missing. Real icons should be placed
  // in /assets per the README.
  if (process.platform === 'win32') return path.join(__dirname, 'assets', 'icon.ico');
  if (process.platform === 'darwin') return path.join(__dirname, 'assets', 'icon.icns');
  return path.join(__dirname, 'assets', 'icon.png');
}

function getTrayIconPath() {
  // Tray icons should be a 16/22px PNG. On macOS they look best as a
  // monochrome "template" image — but a regular PNG works too.
  return path.join(__dirname, 'assets', 'tray.png');
}

function createTray() {
  try {
    let img = nativeImage.createFromPath(getTrayIconPath());
    if (img.isEmpty()) {
      // Fall back to the app icon if there's no dedicated tray icon.
      img = nativeImage.createFromPath(getIconPath()).resize({ width: 18, height: 18 });
    }
    if (process.platform === 'darwin') img.setTemplateImage(true);
    tray = new Tray(img);
  } catch (e) {
    console.warn('Could not create tray icon:', e.message);
    return;
  }

  refreshTrayMenu();

  tray.setToolTip('Tempo — Focus Timer');

  // Left-click toggles the main window. (On Windows this is the natural action;
  // on macOS the click usually opens the menu, but we wire it to toggle for
  // consistency.)
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

function refreshTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: `Tempo — ${lastState.label}: ${lastState.timeStr}`, enabled: false },
    { type: 'separator' },
    { label: 'Show Tempo', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Hide Tempo', click: () => mainWindow?.hide() },
    { type: 'separator' },
    {
      label: 'Toggle Floating Widget',
      click: () => widgetWindow ? destroyWidgetWindow() : createWidgetWindow()
    },
    { type: 'separator' },
    {
      label: lastState.running ? 'Pause Timer' : 'Start Timer',
      click: () => mainWindow?.webContents.send('action', 'toggle')
    },
    { label: 'Reset Timer', click: () => mainWindow?.webContents.send('action', 'reset') },
    { type: 'separator' },
    { label: 'Quit Tempo', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Tempo — ${lastState.label}: ${lastState.timeStr}`);
}

// =============================================================
// APPLICATION MENU
// =============================================================

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: 'Tempo',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit Tempo', accelerator: 'Cmd+Q', click: () => { app.isQuitting = true; app.quit(); } }
      ]
    }] : []),
    {
      label: 'Timer',
      submenu: [
        { label: 'Start / Pause', accelerator: 'Space', click: () => mainWindow?.webContents.send('action', 'toggle') },
        { label: 'Reset',         accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.send('action', 'reset') },
        { label: 'Skip',          accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('action', 'skip') },
        { type: 'separator' },
        { label: 'Toggle Floating Widget', accelerator: 'CmdOrCtrl+Shift+W',
          click: () => widgetWindow ? destroyWidgetWindow() : createWidgetWindow() },
        { label: 'Toggle Fullscreen', accelerator: 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [])
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'About Tempo', click: () => shell.openExternal('https://github.com') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// =============================================================
// IPC HANDLERS
//
// Messages from the renderer (the web pages). They use the
// "electronAPI" object exposed by preload.js.
// =============================================================

// The renderer pushes its timer state up here every tick. We
// remember it, then forward it down to the widget window (if
// open), and refresh the tray menu.
ipcMain.on('state', (event, state) => {
  lastState = { ...lastState, ...state };
  if (widgetWindow) widgetWindow.webContents.send('state', lastState);
  refreshTrayMenu();
  updateDockBadge();
});

// The widget window can send actions (e.g. clicking Pause).
// We forward them to the main window so the timer state stays
// in one place.
ipcMain.on('widget-action', (event, action) => {
  if (mainWindow) mainWindow.webContents.send('action', action);
});

// Open/close the widget on request (from the in-app "Pop out" button).
ipcMain.on('widget-open',  () => createWidgetWindow());
ipcMain.on('widget-close', () => destroyWidgetWindow());

// Auto-launch toggle.
ipcMain.on('auto-launch', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: false });
});
ipcMain.handle('auto-launch-status', () => app.getLoginItemSettings().openAtLogin);

// Native notification on session end (renderer can fall back to web
// Notification API, but the native one gets us icon, sound, etc).
ipcMain.on('notify', (event, { title, body }) => {
  if (!Notification.isSupported()) return;
  new Notification({ title: title || 'Tempo', body: body || '' }).show();
});

// =============================================================
// LIFECYCLE
// =============================================================

app.whenReady().then(() => {
  createMainWindow();
  buildAppMenu();
  createTray();

  // Global shortcut so the user can start/pause Tempo from anywhere on
  // their machine. Cmd/Ctrl+Shift+Space avoids conflicting with the
  // OS-level Spotlight (Cmd+Space).
  try {
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      if (mainWindow) mainWindow.webContents.send('action', 'toggle');
    });
  } catch (e) { console.warn('Could not register global shortcut:', e.message); }

  app.on('activate', () => {
    // macOS: clicking the dock icon re-opens the window if it was hidden.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else mainWindow?.show();
  });
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });

app.on('window-all-closed', () => {
  // On macOS, apps traditionally stay running even with no windows open
  // (the dock icon stays visible). Tempo behaves that way: only quit on
  // explicit user action via tray/menu.
  if (process.platform !== 'darwin') {
    // On Windows/Linux, we want to keep running too because of the tray.
    // The tray's "Quit Tempo" item sets isQuitting and calls app.quit().
  }
});
