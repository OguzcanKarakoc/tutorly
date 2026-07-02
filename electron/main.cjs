const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const agent = require('./agent.cjs');

// In screenshot mode the window may be occluded; keep Chromium painting anyway.
if (process.env.TEACH_SCREENSHOT) {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

// ---------- persistence ----------

const dataPath = () => path.join(app.getPath('userData'), 'teach-data.json');
const settingsPath = () => path.join(app.getPath('userData'), 'teach-settings.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  try { fs.writeFileSync(file, JSON.stringify(value, null, 2)); } catch (e) { console.error('write failed', file, e); }
}

function loadSettings() {
  const raw = readJson(settingsPath(), {});
  let apiKey = '';
  if (raw.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try { apiKey = safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, 'base64')); } catch (e) {}
  }
  return { method: raw.method || 'cli', model: raw.model || agent.DEFAULT_MODEL, connected: !!raw.connected, apiKey };
}

function saveSettings({ method, model, connected, apiKey }) {
  const raw = { method, model, connected };
  if (apiKey && safeStorage.isEncryptionAvailable()) {
    raw.apiKeyEnc = safeStorage.encryptString(apiKey).toString('base64');
  }
  writeJson(settingsPath(), raw);
}

// ---------- IPC ----------

let settings = null;

function registerIpc() {
  settings = loadSettings();
  agent.configure({ method: settings.method, apiKey: settings.apiKey, model: settings.model });

  ipcMain.handle('state:load', () => ({
    data: readJson(dataPath(), null),
    settings: { method: settings.method, model: settings.model, connected: settings.connected, hasApiKey: !!settings.apiKey },
  }));

  ipcMain.handle('state:save', (_e, data) => { writeJson(dataPath(), data); return true; });

  ipcMain.handle('agent:connect', async (_e, { method, apiKey, model }) => {
    try {
      if (method) settings.method = method;
      if (apiKey) settings.apiKey = apiKey;
      if (model) settings.model = model;
      agent.configure({ method: settings.method, apiKey: settings.apiKey, model: settings.model });
      const info = await agent.verifyConnection();
      settings.connected = true;
      saveSettings(settings);
      return { ok: true, model: info.model, displayName: info.displayName };
    } catch (e) {
      settings.connected = false;
      saveSettings(settings);
      return { ok: false, error: agent.errMessage(e) };
    }
  });

  ipcMain.handle('agent:disconnect', () => {
    settings.connected = false;
    settings.apiKey = '';
    saveSettings(settings);
    agent.configure({ method: settings.method, apiKey: '', model: settings.model });
    return { ok: true };
  });

  ipcMain.handle('agent:setMethod', (_e, method) => {
    settings.method = method;
    saveSettings(settings);
    agent.configure({ method, apiKey: settings.apiKey, model: settings.model });
    return { ok: true };
  });

  ipcMain.handle('agent:setModel', (_e, model) => {
    settings.model = model;
    saveSettings(settings);
    agent.configure({ method: settings.method, apiKey: settings.apiKey, model });
    return { ok: true };
  });

  ipcMain.handle('teach:start', async (_e, { prompt }) => {
    try { return { ok: true, result: await agent.startCourse({ prompt }) }; }
    catch (e) { return { ok: false, error: agent.errMessage(e) }; }
  });

  ipcMain.handle('teach:next', async (_e, payload) => {
    try { return { ok: true, result: await agent.nextLesson(payload) }; }
    catch (e) { return { ok: false, error: agent.errMessage(e) }; }
  });

  ipcMain.handle('teach:thread', async (_e, payload) => {
    try { return { ok: true, result: await agent.askThread(payload) }; }
    catch (e) { return { ok: false, error: agent.errMessage(e) }; }
  });
}

// ---------- window ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 700,
    minHeight: 520,
    title: 'Teach',
    backgroundColor: '#f6f8fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.TEACH_SCREENSHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env.TEACH_EXEC) {
            const res = await win.webContents.executeJavaScript(process.env.TEACH_EXEC);
            console.log('[teach] exec result:', res);
            await new Promise(r => setTimeout(r, Number(process.env.TEACH_EXEC_WAIT || 1200)));
          }
          const img = await win.webContents.capturePage();
          console.log('[teach] capture size:', JSON.stringify(img.getSize()));
          fs.writeFileSync(process.env.TEACH_SCREENSHOT, img.toPNG());
        } finally {
          app.quit();
        }
      }, 2200);
    });
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
