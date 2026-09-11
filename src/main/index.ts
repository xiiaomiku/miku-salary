import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultSettings, SalarySettings, validateSettings, WIDGET_GROUP_ID } from '../shared/salary';

let persistedSettings: SalarySettings = { ...defaultSettings };

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function loadPersistedSettings(): Promise<SalarySettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8');
    persistedSettings = validateSettings(JSON.parse(raw) as SalarySettings);
  } catch {
    try {
      // Preserve settings for users upgrading from the former MYR Salary Clock name.
      const legacyPath = path.join(app.getPath('appData'), 'MYR Salary Clock', 'settings.json');
      const raw = await readFile(legacyPath, 'utf8');
      persistedSettings = validateSettings(JSON.parse(raw) as SalarySettings);
      await persistSettings(persistedSettings);
    } catch {
      // First launch and invalid old files both safely use the defaults.
      persistedSettings = { ...defaultSettings };
    }
  }
  return persistedSettings;
}

async function persistSettings(settings: SalarySettings): Promise<void> {
  const file = settingsPath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.new`;
  await writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8');
  await rename(temporary, file);
}

/**
 * WidgetKit runs out-of-process, so macOS reads a tiny shared state file from
 * the application-group container. The Widget Extension entitlement controls
 * access; Windows simply skips this step.
 */
async function publishWidgetState(settings: SalarySettings): Promise<void> {
  if (process.platform !== 'darwin') return;
  const home = app.getPath('home');
  const folder = path.join(home, 'Library', 'Group Containers', WIDGET_GROUP_ID, 'Library', 'Application Support', 'Miku Salary');
  await mkdir(folder, { recursive: true });
  const state = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    settings,
  };
  await writeFile(path.join(folder, 'widget-state.json'), JSON.stringify(state), 'utf8');
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 720,
    minHeight: 600,
    backgroundColor: '#d9d5d2',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173');
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  await loadPersistedSettings();
  ipcMain.handle('settings:load', () => persistedSettings);
  ipcMain.handle('settings:save', async (_event, incoming: SalarySettings) => {
    const settings = validateSettings(incoming);
    await persistSettings(settings);
    persistedSettings = settings;
    try {
      await publishWidgetState(settings);
      return { settings, widgetPublished: process.platform === 'darwin' };
    } catch (error) {
      // Settings are already safely stored locally. Surface the widget bridge issue without losing data.
      return { settings, widgetPublished: false, widgetError: error instanceof Error ? error.message : '无法更新 Widget。' };
    }
  });

  try {
    await publishWidgetState(persistedSettings);
  } catch {
    // The app remains usable if the optional WidgetKit companion has not been installed yet.
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
