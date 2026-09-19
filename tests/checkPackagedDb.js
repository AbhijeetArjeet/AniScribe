const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'BatchFetch', 'batchfetch.db');
const db = new DatabaseSync(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables created in packaged user data:', tables);

const settings = db.prepare("SELECT * FROM settings").all();
console.log('Default settings written by packaged app:', settings);
