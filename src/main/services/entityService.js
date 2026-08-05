const fs = require('fs');
const path = require('path');
const { dialog, app } = require('electron');
const Database = require('better-sqlite3');
const { migrate } = require('../storage/database');
const { resolveCoordinates, geocodeWithOpenStreetMap } = require('./geocodingService');
const { VEHICLE_TYPES, CARGO_TYPES, PERSONNEL_POSITIONS, ORDER_TYPES, ORDER_STATUSES, DELIVERY_NOTE_STATUSES, INVOICE_STATUSES, assertRequired, assertOneOf, assertNonNegative, assertPercent, toBool, toCents, parseLocaleNumber, calculateMaintenance, calculateRevenue, calculateInvestment, calculateProfitLoss, calculateUtilization, haversineKm, suggestVehicleCombinations } = require('../../shared/business');

const TABLES = {
  vehicles: 'vehicles', personnel: 'personnel', orders: 'orders', deliveryNotes: 'delivery_notes', invoices: 'invoices', investments: 'investments', locations: 'locations'
};

function nowUpdate(table) { return `updated_at = CURRENT_TIMESTAMP`; }
function stripId(row) { const { id, created_at, updated_at, ...rest } = row; return rest; }

function list(db, entity) {
  ensureEntity(entity);
  if (entity === 'orders') return db.prepare(`SELECT o.*, COALESCE(group_concat(v.name || ' (' || v.license_plate || ')', ', '), '') assigned_vehicles, COALESCE(SUM(CASE WHEN a.active=1 THEN v.capacity_fe ELSE 0 END), 0) assigned_capacity_fe FROM orders o LEFT JOIN order_vehicle_assignments a ON a.order_id=o.id AND a.active=1 LEFT JOIN vehicles v ON v.id=a.vehicle_id GROUP BY o.id ORDER BY o.updated_at DESC`).all().map(enrichOrder);
  if (entity === 'vehicles') return db.prepare(`SELECT v.*, COALESCE(o.order_number || ' · ' || o.customer, '') assigned_order FROM vehicles v LEFT JOIN order_vehicle_assignments a ON a.vehicle_id=v.id AND a.active=1 LEFT JOIN orders o ON o.id=a.order_id AND o.status!='geliefert' ORDER BY v.updated_at DESC`).all().map((row) => enrich(entity, row));
  return db.prepare(`SELECT * FROM ${TABLES[entity]} ORDER BY updated_at DESC`).all().map((row) => enrich(entity, row));
}

function get(db, entity, id) {
  ensureEntity(entity);
  const row = db.prepare(`SELECT * FROM ${TABLES[entity]} WHERE id = ?`).get(id);
  if (!row) throw new Error('Datensatz wurde nicht gefunden.');
  if (entity === 'orders') {
    row.vehicle_ids = db.prepare('SELECT vehicle_id FROM order_vehicle_assignments WHERE order_id = ? AND active = 1').all(id).map((item) => item.vehicle_id);
    row.assigned_capacity_fe = db.prepare('SELECT COALESCE(SUM(v.capacity_fe), 0) capacity FROM order_vehicle_assignments a JOIN vehicles v ON v.id=a.vehicle_id WHERE a.order_id=? AND a.active=1').get(id).capacity;
  }
  return enrich(entity, row);
}

function create(db, entity, data) {
  ensureEntity(entity);
  return save(db, entity, null, data);
}

function update(db, entity, id, data) {
  ensureEntity(entity);
  if (!id) throw new Error('Datensatz-ID fehlt.');
  return save(db, entity, id, data);
}

function remove(db, entity, id) {
  ensureEntity(entity);
  if (entity === 'vehicles') {
    const assignments = db.prepare('SELECT COUNT(*) count FROM order_vehicle_assignments WHERE vehicle_id=?').get(id).count;
    if (assignments > 0) {
      db.transaction(() => {
        db.prepare('UPDATE order_vehicle_assignments SET active=0, released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE vehicle_id=? AND active=1').run(id);
        db.prepare('DELETE FROM vehicles WHERE id=?').run(id);
      })();
      return { ok: true, warning: 'Fahrzeug hatte Auftragszuordnungen. Aktive Zuordnungen wurden kontrolliert aufgehoben.' };
    }
  }
  if (entity === 'orders') {
    db.transaction(() => {
      db.prepare('UPDATE order_vehicle_assignments SET active=0, released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND active=1').run(id);
      db.prepare('UPDATE vehicles SET available=1, updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT vehicle_id FROM order_vehicle_assignments WHERE order_id=?)').run(id);
      db.prepare('DELETE FROM orders WHERE id=?').run(id);
    })();
    return { ok: true };
  }
  db.prepare(`DELETE FROM ${TABLES[entity]} WHERE id = ?`).run(id);
  return { ok: true };
}

function save(db, entity, id, data) {
  const handlers = { vehicles: saveVehicle, personnel: savePersonnel, orders: saveOrder, deliveryNotes: saveDeliveryNote, invoices: saveInvoice, investments: saveInvestment, locations: saveLocation };
  const savedId = handlers[entity](db, id, data || {});
  return get(db, entity, savedId);
}

function saveVehicle(db, id, data) {
  assertRequired(data.name, 'Name'); assertRequired(data.license_plate, 'Kennzeichen'); assertOneOf(data.vehicle_type, VEHICLE_TYPES, 'Fahrzeugtyp'); assertOneOf(data.cargo_type, CARGO_TYPES, 'Frachttyp');
  ['capacity_fe','value','tank_size_liters','fuel_consumption_l_100km','current_mileage','maintenance_interval_km','last_maintenance_mileage'].forEach((key) => assertNonNegative(data[key], key));
  ['brake_status','engine_status','clutch_status','tire_status'].forEach((key) => assertPercent(data[key], key));
  const isTrailer = ['Auflieger', 'Lkw-Anhänger'].includes(data.vehicle_type);
  const capacity = data.vehicle_type === 'Sattelzugmaschine' ? null : parseLocaleNumber(data.capacity_fe || 0);
  const location = id ? getLocationForVehicle(db, data.location_label || 'Hauptniederlassung Kassel') : getLocationForVehicle(db, 'Hauptniederlassung Kassel');
  const row = { name: data.name.trim(), license_plate: data.license_plate.trim(), vehicle_type: data.vehicle_type, cargo_type: data.cargo_type, capacity_fe: capacity, value_cents: toCents(data.value), tank_size_liters: parseLocaleNumber(data.tank_size_liters || 0), fuel_consumption_l_100km: parseLocaleNumber(data.fuel_consumption_l_100km || 0), current_mileage: parseLocaleNumber(data.current_mileage || 0), maintenance_interval_km: parseLocaleNumber(data.maintenance_interval_km || 0), last_maintenance_mileage: parseLocaleNumber(data.last_maintenance_mileage || 0), brake_status: nullableNumber(data.brake_status), engine_status: isTrailer ? null : nullableNumber(data.engine_status), clutch_status: isTrailer ? null : nullableNumber(data.clutch_status), tire_status: nullableNumber(data.tire_status), has_fax: toBool(data.has_fax), has_tank_upgrade: toBool(data.has_tank_upgrade), location_label: location.name, latitude: location.latitude, longitude: location.longitude, available: data.available === undefined ? 1 : toBool(data.available) };
  return runDbWrite(() => upsert(db, 'vehicles', id, row));
}

function savePersonnel(db, id, data) {
  assertRequired(data.personnel_number, 'Personalnummer'); assertRequired(data.name, 'Name'); assertRequired(data.hire_date, 'Einstellungsdatum'); assertOneOf(data.position, PERSONNEL_POSITIONS, 'Position'); assertNonNegative(data.salary, 'Gehalt');
  assertDate(data.hire_date, 'Einstellungsdatum');
  return runDbWrite(() => upsert(db, 'personnel', id, { personnel_number: data.personnel_number.trim(), name: data.name.trim(), hire_date: data.hire_date, salary_cents: toCents(data.salary), position: data.position, has_adr_training: data.position === 'Lkw-Fahrer' ? toBool(data.has_adr_training) : 0 }));
}

function saveOrder(db, id, data) {
  assertRequired(data.order_number, 'Auftragsnummer'); assertRequired(data.customer, 'Kunde'); assertRequired(data.start_location, 'Startort'); assertRequired(data.delivery_location, 'Lieferort'); assertOneOf(data.order_type, ORDER_TYPES, 'Auftragsart'); assertOneOf(data.cargo_type, CARGO_TYPES, 'Frachttyp'); assertOneOf(data.status, ORDER_STATUSES, 'Auftragsstatus');
  ['distance_km','cargo_amount_fe','unit_price'].forEach((key) => assertNonNegative(data[key], key));
  const row = { order_number: data.order_number.trim(), order_type: data.order_type, customer: data.customer.trim(), start_location: data.start_location.trim(), delivery_location: data.delivery_location.trim(), return_to_kassel: toBool(data.return_to_kassel), distance_km: parseLocaleNumber(data.distance_km || 0), delivery_deadline: data.delivery_deadline || null, adr_required: toBool(data.adr_required), delivery_date: data.order_type === 'Lagervertrag' ? (data.delivery_date || null) : null, cargo_type: data.cargo_type, cargo_amount_fe: parseLocaleNumber(data.cargo_amount_fe || 0), unit_price_cents: toCents(data.unit_price), status: data.status };
  if (row.delivery_deadline) assertDate(row.delivery_deadline, 'Lieferfrist');
  if (row.delivery_date) assertDate(row.delivery_date, 'Liefertermin');
  return db.transaction(() => {
    const orderId = upsert(db, 'orders', id, row);
    replaceAssignments(db, orderId, data.vehicle_ids || []);
    assertSufficientCapacity(db, orderId);
    if (row.status === 'geliefert') releaseOrderVehicles(db, orderId);
    return orderId;
  })();
}

function saveDeliveryNote(db, id, data) {
  assertRequired(data.order_number, 'Auftragsnummer'); assertRequired(data.debtor, 'Debitor'); assertRequired(data.goods, 'Ware'); assertOneOf(data.status, DELIVERY_NOTE_STATUSES, 'Status'); assertNonNegative(data.cargo_amount_fe, 'Frachtmenge'); assertNonNegative(data.revenue, 'Umsatz');
  return runDbWrite(() => upsert(db, 'delivery_notes', id, { order_id: data.order_id || null, order_number: data.order_number.trim(), debtor: data.debtor.trim(), goods: data.goods.trim(), cargo_amount_fe: parseLocaleNumber(data.cargo_amount_fe || 0), revenue_cents: toCents(data.revenue), status: data.status }));
}

function saveInvoice(db, id, data) {
  assertRequired(data.invoice_number, 'Rechnungsnummer'); assertRequired(data.creditor, 'Kreditor'); assertRequired(data.item, 'Posten'); assertRequired(data.invoice_date, 'Datum'); assertRequired(data.due_date, 'Faelligkeit'); assertOneOf(data.payment_status, INVOICE_STATUSES, 'Zahlungsstatus'); assertNonNegative(data.amount, 'Betrag');
  assertDate(data.invoice_date, 'Datum'); assertDate(data.due_date, 'Faelligkeit');
  const status = data.payment_status !== 'bezahlt' && data.due_date < new Date().toISOString().slice(0, 10) ? 'überfällig' : data.payment_status;
  return runDbWrite(() => upsert(db, 'invoices', id, { invoice_number: data.invoice_number.trim(), creditor: data.creditor.trim(), item: data.item.trim(), amount_cents: toCents(data.amount), invoice_date: data.invoice_date, due_date: data.due_date, payment_status: status }));
}

function saveInvestment(db, id, data) {
  const calc = calculateInvestment(data.measure, { regional: data.scope_regional, national: data.scope_national, international: data.scope_international });
  return runDbWrite(() => upsert(db, 'investments', id, { measure: data.measure, scope_regional: toBool(data.scope_regional), scope_national: toBool(data.scope_national), scope_international: toBool(data.scope_international) }));
}

function saveLocation(db, id, data) {
  assertRequired(data.name, 'Standortname'); assertRequired(data.address, 'Adresse');
  const existing = id ? db.prepare('SELECT latitude, longitude, geocoding_status FROM locations WHERE id=?').get(id) : null;
  const latitude = data.latitude === undefined ? existing?.latitude ?? null : nullableNumber(data.latitude);
  const longitude = data.longitude === undefined ? existing?.longitude ?? null : nullableNumber(data.longitude);
  const status = data.geocoding_status || existing?.geocoding_status || 'unbekannt';
  if ((latitude == null || longitude == null) && status !== 'unbekannt' && status !== 'nicht gefunden') throw new Error('Breiten- und Laengengrad fehlen. Bitte Standort ueber OpenStreetMap geocodieren.');
  if (latitude != null && (latitude < -90 || latitude > 90)) throw new Error('Breitengrad muss zwischen -90 und 90 liegen.');
  if (longitude != null && (longitude < -180 || longitude > 180)) throw new Error('Laengengrad muss zwischen -180 und 180 liegen.');
  return runDbWrite(() => upsert(db, 'locations', id, { name: data.name.trim(), address: data.address.trim(), latitude, longitude, geocoding_status: latitude == null || longitude == null ? status : (data.geocoding_status || 'ok') }));
}

function upsert(db, table, id, row) {
  const keys = Object.keys(row);
  if (id) {
    db.prepare(`UPDATE ${table} SET ${keys.map((key) => `${key}=@${key}`).join(', ')}, ${nowUpdate(table)} WHERE id=@id`).run({ ...row, id });
    return Number(id);
  }
  const result = db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((key) => `@${key}`).join(', ')})`).run(row);
  return Number(result.lastInsertRowid);
}

function replaceAssignments(db, orderId, vehicleIds) {
  const current = db.prepare('SELECT status FROM orders WHERE id=?').get(orderId);
  if (current.status === 'geliefert') return;
  db.prepare('UPDATE order_vehicle_assignments SET active=0, released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND active=1').run(orderId);
  db.prepare('UPDATE vehicles SET available=1, updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT vehicle_id FROM order_vehicle_assignments WHERE order_id=?)').run(orderId);
  const uniqueIds = [...new Set(vehicleIds.map(Number).filter(Boolean))];
  for (const vehicleId of uniqueIds) {
    const active = db.prepare('SELECT order_id FROM order_vehicle_assignments WHERE vehicle_id=? AND active=1').get(vehicleId);
    if (active && active.order_id !== orderId) throw new Error('Ein Fahrzeug ist bereits einem aktiven Auftrag zugeordnet.');
    db.prepare('INSERT INTO order_vehicle_assignments (order_id, vehicle_id) VALUES (?, ?)').run(orderId, vehicleId);
    db.prepare('UPDATE vehicles SET available=0, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(vehicleId);
  }
}

function releaseOrderVehicles(db, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  const location = order.return_to_kassel ? 'Hauptniederlassung Kassel' : order.start_location;
  const coords = resolveCoordinates(db, location);
  db.prepare('UPDATE order_vehicle_assignments SET active=0, released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND active=1').run(orderId);
  db.prepare('UPDATE vehicles SET available=1, location_label=?, latitude=?, longitude=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT vehicle_id FROM order_vehicle_assignments WHERE order_id=?)').run(location, coords?.latitude ?? null, coords?.longitude ?? null, orderId);
}

function vehicleOptions(db, order) {
  const start = resolveCoordinates(db, order.start_location);
  return db.prepare(`SELECT v.*, NOT EXISTS(SELECT 1 FROM order_vehicle_assignments a JOIN orders o ON o.id=a.order_id WHERE a.vehicle_id=v.id AND a.active=1 AND o.status!='geliefert') selectable FROM vehicles v ORDER BY v.name`).all().map((vehicle) => ({ ...enrich('vehicles', vehicle), distance_km: haversineKm(start, vehicle), available: Boolean(vehicle.selectable), selectable: Boolean(vehicle.selectable) }));
}

function orderOptions(db) {
  return list(db, 'orders').map((order) => ({ id: order.id, order_number: order.order_number, customer: order.customer, cargo_amount_fe: order.cargo_amount_fe, revenue_cents: order.revenue_cents, cargo_type: order.cargo_type }));
}

function locationOptions(db) {
  ensureDefaultLocation(db);
  return db.prepare('SELECT id, name, address, latitude, longitude, geocoding_status FROM locations ORDER BY name').all();
}

async function geocodeLocation(db, id) {
  const location = db.prepare('SELECT * FROM locations WHERE id=?').get(id);
  if (!location) throw new Error('Standort wurde nicht gefunden.');
  const coordinates = await geocodeWithOpenStreetMap(db, `${location.address || location.name}, Deutschland`);
  if (!coordinates) {
    db.prepare("UPDATE locations SET latitude=NULL, longitude=NULL, geocoding_status='nicht gefunden', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
    return get(db, 'locations', id);
  }
  db.prepare("UPDATE locations SET latitude=?, longitude=?, geocoding_status='ok', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(coordinates.latitude, coordinates.longitude, id);
  db.prepare('UPDATE vehicles SET latitude=?, longitude=?, updated_at=CURRENT_TIMESTAMP WHERE location_label=?').run(coordinates.latitude, coordinates.longitude, location.name);
  return get(db, 'locations', id);
}

async function geocodeAddress(db, query) {
  assertRequired(query, 'Adresse');
  const coordinates = await geocodeWithOpenStreetMap(db, `${query}, Deutschland`);
  if (!coordinates) throw new Error('Fuer diese Adresse wurden keine Koordinaten gefunden.');
  return { ...coordinates, geocoding_status: 'ok' };
}

function mapData(db, includeVehicles) {
  const locations = locationOptions(db).filter((location) => location.latitude != null && location.longitude != null);
  const vehicles = includeVehicles ? list(db, 'vehicles').filter((vehicle) => vehicle.latitude != null && vehicle.longitude != null).map((vehicle) => ({ id: vehicle.id, name: vehicle.name, license_plate: vehicle.license_plate, vehicle_type: vehicle.vehicle_type, cargo_type: vehicle.cargo_type, location_label: vehicle.location_label, latitude: vehicle.latitude, longitude: vehicle.longitude, available: vehicle.available })) : [];
  return { locations, vehicles };
}

function suggestions(db, order) {
  return suggestVehicleCombinations(order, vehicleOptions(db, order));
}

function dashboard(db) {
  const vehicles = list(db, 'vehicles');
  const orders = list(db, 'orders');
  const deliveryNotes = list(db, 'deliveryNotes');
  const invoices = list(db, 'invoices');
  const investments = list(db, 'investments');
  const pl = calculateProfitLoss(deliveryNotes, invoices);
  return {
    metrics: {
      vehicles: vehicles.length, availableVehicles: vehicles.filter((v) => v.available).length, assignedVehicles: vehicles.filter((v) => !v.available).length, overdueMaintenance: vehicles.filter((v) => v.maintenance.remainingKm < 0).length, vehiclesWithoutFax: vehicles.filter((v) => !v.has_fax).length, personnel: db.prepare('SELECT COUNT(*) count FROM personnel').get().count, openOrders: orders.filter((o) => o.status === 'offen').length, activeOrders: orders.filter((o) => o.status === 'in Arbeit').length, storedOrders: orders.filter((o) => o.status === 'eingelagert').length, paidIncomeCents: pl.incomeCents, paidExpenseCents: pl.expenseCents, profitLossCents: pl.resultCents, investmentCostCents: investments.reduce((sum, item) => sum + item.cost_cents, 0)
    },
    warnings: [
      ...vehicles.filter((v) => v.maintenance.remainingKm < 0).map((v) => `Wartung bei ${v.name} ${v.maintenance.label}.`),
      ...vehicles.filter((v) => !v.has_fax).map((v) => `${v.name} hat kein Fax eingebaut.`),
      ...deliveryNotes.filter((n) => n.status === 'überfällig').map((n) => `Lieferschein ${n.order_number} ist ueberfaellig.`),
      ...invoices.filter((i) => i.payment_status === 'überfällig').map((i) => `Eingangsrechnung ${i.invoice_number} ist ueberfaellig.`),
      ...orders.filter((o) => o.status !== 'geliefert' && Number(o.assigned_capacity_fe || 0) < Number(o.cargo_amount_fe || 0)).map((o) => `Auftrag ${o.order_number} hat keine ausreichende Fahrzeugkapazitaet.`)
    ]
  };
}

function backupDatabase(db) {
  const target = path.join(path.dirname(db.filePath), `fleetdesk-backup-${Date.now()}.sqlite`);
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(db.filePath, target);
  return { path: target };
}

async function exportDatabase(db) {
  const result = await dialog.showSaveDialog({ title: 'Datenbank exportieren', defaultPath: 'fleetdesk-export.sqlite', filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }] });
  if (result.canceled) return { canceled: true };
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(db.filePath, result.filePath);
  return { path: result.filePath };
}

async function importDatabase(db) {
  const result = await dialog.showOpenDialog({ title: 'Datenbank importieren', properties: ['openFile'], filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }] });
  if (result.canceled) return { canceled: true };
  validateImportDatabase(result.filePaths[0]);
  const backup = backupDatabase(db).path;
  db.close();
  try { fs.copyFileSync(result.filePaths[0], db.filePath); return { imported: true, backup, restartRequired: true }; } catch (error) { fs.copyFileSync(backup, db.filePath); throw error; }
}

function validateImportDatabase(filePath) {
  const imported = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const required = ['vehicles','personnel','orders','order_vehicle_assignments','delivery_notes','invoices','investments','geocoding_cache','app_settings','schema_migrations','locations'];
    const tables = new Set(imported.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    for (const table of required) if (!tables.has(table)) throw new Error(`Importdatenbank enthaelt die Tabelle ${table} nicht.`);
    const version = imported.prepare('SELECT MAX(version) version FROM schema_migrations').get().version;
    if (!version || version < 1) throw new Error('Importdatenbank hat keinen gueltigen Migrationsstand.');
    return true;
  } finally { imported.close(); }
}

function enrich(entity, row) {
  if (entity === 'vehicles') return { ...row, available: Boolean(row.available), has_fax: Boolean(row.has_fax), has_tank_upgrade: Boolean(row.has_tank_upgrade), maintenance: calculateMaintenance(row.current_mileage, row.maintenance_interval_km, row.last_maintenance_mileage) };
  if (entity === 'orders') return enrichOrder(row);
  if (entity === 'investments') { const calc = calculateInvestment(row.measure, { regional: row.scope_regional, national: row.scope_national, international: row.scope_international }); return { ...row, scope_regional: Boolean(row.scope_regional), scope_national: Boolean(row.scope_national), scope_international: Boolean(row.scope_international), success_rate: calc.successRate, cost_cents: calc.costCents }; }
  return row;
}

function enrichOrder(row) { return { ...row, return_to_kassel: Boolean(row.return_to_kassel), adr_required: Boolean(row.adr_required), revenue_cents: calculateRevenue(row.cargo_amount_fe, row.distance_km, row.unit_price_cents), utilization: calculateUtilization(row.cargo_amount_fe, row.assigned_capacity_fe) }; }
function relaunchApp() {
  app.relaunch();
  app.exit(0);
}

function ensureDefaultLocation(db) {
  db.prepare("INSERT OR IGNORE INTO locations (name, address, latitude, longitude, geocoding_status) VALUES ('Hauptniederlassung Kassel', 'Kassel', 51.3127, 9.4797, 'ok')").run();
}

function getLocationForVehicle(db, name) {
  ensureDefaultLocation(db);
  const location = db.prepare('SELECT * FROM locations WHERE name=?').get(name);
  if (!location) throw new Error('Bitte einen vorhandenen Standort aus der Standortverwaltung auswaehlen.');
  if (location.latitude == null || location.longitude == null) throw new Error('Der ausgewaehlte Standort hat keine Koordinaten. Bitte zuerst ueber OpenStreetMap geocodieren.');
  return location;
}

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`${label} muss ein gueltiges ISO-Datum sein.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} muss ein gueltiges Datum sein.`);
}

function assertSufficientCapacity(db, orderId) {
  const order = db.prepare('SELECT status, cargo_amount_fe FROM orders WHERE id=?').get(orderId);
  if (!order || order.status === 'geliefert') return;
  const assigned = db.prepare('SELECT COUNT(*) count, COALESCE(SUM(v.capacity_fe), 0) capacity FROM order_vehicle_assignments a JOIN vehicles v ON v.id=a.vehicle_id WHERE a.order_id=? AND a.active=1').get(orderId);
  if (assigned.count > 0 && Number(assigned.capacity || 0) < Number(order.cargo_amount_fe || 0)) throw new Error('Die ausgewaehlten Fahrzeuge haben keine ausreichende Kapazitaet fuer diesen Auftrag.');
}

function runDbWrite(callback) {
  try { return callback(); } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) throw new Error('Ein Datensatz mit diesem eindeutigen Wert existiert bereits.');
    throw error;
  }
}

function nullableNumber(value) { return value === '' || value === undefined || value === null ? null : parseLocaleNumber(value); }
function ensureEntity(entity) { if (!TABLES[entity]) throw new Error('Unbekannter Verwaltungsbereich.'); }

module.exports = { list, get, create, update, remove, dashboard, vehicleOptions, suggestions, orderOptions, locationOptions, geocodeLocation, geocodeAddress, mapData, exportDatabase, importDatabase, backupDatabase, validateImportDatabase, relaunchApp };
