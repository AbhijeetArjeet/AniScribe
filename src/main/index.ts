import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initDatabase, closeDatabase } from './storage/database';
import { runMigrations } from './storage/migrations';
import { DownloadRepository } from './storage/downloadRepository';
import { SettingsRepository } from './storage/settingsRepository';
import { LibraryRepository } from './library/libraryRepository';
import { LibraryManager } from './library/libraryManager';
import { DownloadManager } from './downloader/DownloadManager';
import { ProviderRegistry } from './provider/ProviderRegistry';
import { ProviderManager } from './provider/ProviderManager';
import { ExportManager } from './export/exportManager';
import { StorageManager } from './storage/storageManager';
import { registerMediaSchemesAsPrivileged, registerMediaProtocol } from './player/protocolHandler';
import { registerDownloadHandlers } from './ipc/downloadHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerHistoryHandlers } from './ipc/historyHandlers';
import { registerLibraryHandlers } from './ipc/libraryHandlers';
import { registerPlayerHandlers } from './ipc/playerHandlers';
import { registerProviderHandlers } from './ipc/providerHandlers';
import { registerExportHandlers } from './ipc/exportHandlers';
import { registerStorageHandlers } from './ipc/storageHandlers';
import { SubtitleGenerator } from './ai/subtitleGenerator';
import { registerAiHandlers } from './ipc/aiHandlers';

// Security: Register media:// scheme as privileged before app is ready
registerMediaSchemesAsPrivileged();

let mainWindow: BrowserWindow | null = null;
let downloadManager: DownloadManager | null = null;
let libraryManager: LibraryManager | null = null;
let exportManager: ExportManager | null = null;
let storageManager: StorageManager | null = null;
let providerManager: ProviderManager | null = null;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 850,
    minHeight: 550,
    backgroundColor: '#0f172a',
    title: 'BatchFetch',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  // Security: Deny all popup / new window requests
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Security: Prevent navigation away from the bundled app
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (isDev && process.env.VITE_DEV_SERVER_URL && navigationUrl.startsWith(process.env.VITE_DEV_SERVER_URL)) {
      return;
    }
    event.preventDefault();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Register media:// custom protocol for local video playback
  registerMediaProtocol();

  // Initialize Database
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'batchfetch.db');
  const db = initDatabase(dbPath);
  runMigrations(db);

  // Repositories
  const downloadRepo = new DownloadRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const libraryRepo = new LibraryRepository(db);

  // Ensure default download directory
  const currentSettings = settingsRepo.getSettings();
  if (!currentSettings.downloadDirectory) {
    settingsRepo.saveSettings({
      downloadDirectory: app.getPath('downloads'),
    });
  }

  libraryManager = new LibraryManager(
    libraryRepo,
    () => settingsRepo.getSettings(),
    () => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('library:updated');
      }
    }
  );

  downloadManager = new DownloadManager(downloadRepo, settingsRepo, () => mainWindow);

  // Hook completed downloads to library organizer
  downloadManager.setOnDownloadComplete(async (item) => {
    await libraryManager?.organizeCompletedDownload(item);
  });

  // Provider Framework
  const providerRegistry = new ProviderRegistry();
  providerManager = new ProviderManager(providerRegistry);

  // Export Subsystem
  exportManager = new ExportManager(
    libraryRepo,
    db,
    (job) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('export:progress', job);
      }
    },
    (job) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('export:statusChange', job);
      }
    }
  );

  // Storage Management
  storageManager = new StorageManager(db, settingsRepo, libraryRepo);

  // AI Subtitle Generator & Live Translation (Hardware-Aware, Offline)
  const subtitleGenerator = new SubtitleGenerator(libraryRepo, userDataPath, db);

  // Register Handlers
  registerDownloadHandlers(downloadManager, () => mainWindow, libraryRepo);
  registerSettingsHandlers(downloadManager);
  registerHistoryHandlers(downloadManager);
  registerLibraryHandlers(libraryRepo, libraryManager);
  registerPlayerHandlers(libraryRepo);
  registerProviderHandlers(providerManager);
  registerExportHandlers(exportManager, () => mainWindow);
  registerStorageHandlers(storageManager, () => mainWindow);
  registerAiHandlers(subtitleGenerator);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

app.on('before-quit', () => {
  downloadManager?.dispose();
  closeDatabase();
});
