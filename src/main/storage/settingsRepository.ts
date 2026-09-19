import { IDatabase, getDatabase } from './database';
import { AppSettings, DEFAULT_SETTINGS } from '../../shared/types/settings';

export class SettingsRepository {
  private db: IDatabase;

  constructor(db?: IDatabase) {
    this.db = db || getDatabase();
  }

  getSettings(): AppSettings {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get('app_settings');
    if (!row) {
      this.saveSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    }
    try {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: Partial<AppSettings>): AppSettings {
    let current: AppSettings = { ...DEFAULT_SETTINGS };
    const stmtSelect = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmtSelect.get('app_settings');
    if (row) {
      try {
        current = { ...current, ...JSON.parse(row.value) };
      } catch {
        // ignore
      }
    }

    const updated: AppSettings = { ...current, ...settings };
    
    // Validate concurrency 1 - 5
    if (updated.concurrency < 1) updated.concurrency = 1;
    if (updated.concurrency > 5) updated.concurrency = 5;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `);
    stmt.run('app_settings', JSON.stringify(updated));
    return updated;
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    return this.saveSettings(settings);
  }
}
