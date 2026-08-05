const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { migrations } = require('./migrations');

function initializeDatabase(userDataPath) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const dbPath = path.join(userDataPath, 'fleetdesk.sqlite');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.filePath = dbPath;
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      const run = db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
      });
      run();
    }
  }
}

module.exports = { initializeDatabase, migrate };
