import path from 'path';
import fs from 'fs';

export interface IDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  };
  close(): void;
}

let dbInstance: IDatabase | null = null;

export function initDatabase(dbPath?: string): IDatabase {
  if (dbInstance) {
    return dbInstance;
  }

  const filePath = dbPath || path.join(process.cwd(), 'batchfetch.db');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let db: any = null;

  // Try better-sqlite3 first
  try {
    const BetterSqlite3 = require('better-sqlite3');
    db = new BetterSqlite3(filePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    console.log('[Database] Loaded better-sqlite3 successfully at', filePath);
  } catch (err: any) {
    console.warn('[Database] better-sqlite3 not available or failed:', err.message);
    // Fallback to node:sqlite (available in modern Node / Electron)
    try {
      const { DatabaseSync } = require('node:sqlite');
      db = new DatabaseSync(filePath);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA foreign_keys = ON;');
      console.log('[Database] Loaded node:sqlite successfully at', filePath);
    } catch (fallbackErr: any) {
      console.error('[Database] Failed to initialize SQLite engine:', fallbackErr.message);
      throw new Error(`Could not load SQLite: ${fallbackErr.message}`);
    }
  }

  const adapter: IDatabase = {
    exec(sql: string) {
      db.exec(sql);
    },
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        run(...params: any[]) {
          return stmt.run(...params);
        },
        get(...params: any[]) {
          return stmt.get(...params);
        },
        all(...params: any[]) {
          return stmt.all(...params);
        },
      };
    },
    close() {
      db.close();
      dbInstance = null;
    },
  };

  dbInstance = adapter;
  return adapter;
}

export function getDatabase(): IDatabase {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
  }
}
