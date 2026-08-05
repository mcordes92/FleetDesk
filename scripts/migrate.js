const os = require('os');
const path = require('path');
const { initializeDatabase } = require('../src/main/storage/database');

const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const db = initializeDatabase(path.join(base, 'FleetDesk'));
db.close();
console.log('FleetDesk-Datenbank wurde initialisiert oder migriert.');
