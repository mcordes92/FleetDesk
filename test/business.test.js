const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { initializeDatabase } = require('../src/main/storage/database');
const service = require('../src/main/services/entityService');
const { calculateMaintenance, calculateRevenue, calculateInvestment, calculateProfitLoss, calculateUtilization, parseLocaleNumber, suggestVehicleCombinations } = require('../src/shared/business');

test('berechnet Wartung und Ueberfaelligkeit', () => {
  assert.deepEqual(calculateMaintenance(12000, 5000, 5000), { nextMaintenanceMileage: 10000, remainingKm: -2000, label: 'Überfällig seit 2000 km' });
});

test('berechnet Umsatz ohne Rueckfahrtaufschlag', () => {
  assert.equal(calculateRevenue(10, 200, 125), 250000);
});

test('berechnet Investitionskosten und Erfolgsquote', () => {
  assert.deepEqual(calculateInvestment('Flyer', { regional: true, national: true, international: false }), { successRate: 1, costCents: 100000 });
});

test('berechnet GuV nur aus bezahlten Datensaetzen', () => {
  const result = calculateProfitLoss([{ status: 'bezahlt', revenue_cents: 50000 }, { status: 'überfällig', revenue_cents: 90000 }], [{ payment_status: 'bezahlt', amount_cents: 20000 }]);
  assert.equal(result.resultCents, 30000);
});

test('berechnet Auslastung', () => {
  assert.equal(calculateUtilization(80, 100), 80);
});

test('liest deutsche Zahlen und OSM-Koordinaten korrekt', () => {
  assert.equal(parseLocaleNumber('1.250,50'), 1250.5);
  assert.equal(parseLocaleNumber('52.52001'), 52.52001);
});

test('schlaegt ausreichende Fahrzeugkombinationen vor', () => {
  const suggestions = suggestVehicleCombinations({ cargo_type: 'Tank', cargo_amount_fe: 18 }, [
    { id: 1, available: true, cargo_type: 'Tank', capacity_fe: 10, distance_km: 20 },
    { id: 2, available: true, cargo_type: 'Universal', capacity_fe: 8, distance_km: 30 },
    { id: 3, available: false, cargo_type: 'Tank', capacity_fe: 20, distance_km: 1 }
  ]);
  assert.equal(suggestions[0].sufficient, true);
  assert.equal(suggestions[0].capacity, 18);
});

test('deaktiviert bedingte Fahrzeugfelder serverseitig', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdesk-'));
  const db = initializeDatabase(dir);
  const vehicle = service.create(db, 'vehicles', { name: 'SZM 1', license_plate: 'KS-FD 1', vehicle_type: 'Sattelzugmaschine', cargo_type: 'Universal', capacity_fe: 50, value: '1000', brake_status: 90, engine_status: 90, clutch_status: 90, tire_status: 90, has_fax: true });
  assert.equal(vehicle.capacity_fe, null);
  db.close();
});

test('gibt Fahrzeuge bei Status geliefert frei und aktualisiert Standort', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdesk-'));
  const db = initializeDatabase(dir);
  const vehicle = service.create(db, 'vehicles', { name: 'Lkw 1', license_plate: 'KS-FD 2', vehicle_type: 'Lkw', cargo_type: 'Pritsche', capacity_fe: 10, value: '1000', has_fax: true });
  const order = service.create(db, 'orders', { order_number: 'A-1', order_type: 'Einzelvertrag', customer: 'Kunde', start_location: 'Berlin', delivery_location: 'Hamburg', distance_km: 100, cargo_type: 'Pritsche', cargo_amount_fe: 10, unit_price: '1,00', status: 'in Arbeit', vehicle_ids: [vehicle.id] });
  assert.equal(service.get(db, 'vehicles', vehicle.id).available, false);
  service.update(db, 'orders', order.id, { ...order, unit_price: '1,00', status: 'geliefert', vehicle_ids: [vehicle.id] });
  const updated = service.get(db, 'vehicles', vehicle.id);
  assert.equal(updated.available, true);
  assert.equal(updated.location_label, 'Berlin');
  db.close();
});

test('liefert zugeordneten Auftrag und verhindert unzureichende aktive Kapazitaet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdesk-'));
  const db = initializeDatabase(dir);
  const vehicle = service.create(db, 'vehicles', { name: 'Lkw klein', license_plate: 'KS-FD 3', vehicle_type: 'Lkw', cargo_type: 'Pritsche', capacity_fe: 5, value: '1000', has_fax: true });
  service.create(db, 'orders', { order_number: 'A-2', order_type: 'Einzelvertrag', customer: 'Kunde', start_location: 'Berlin', delivery_location: 'Hamburg', distance_km: 100, cargo_type: 'Pritsche', cargo_amount_fe: 5, unit_price: '1,00', status: 'in Arbeit', vehicle_ids: [vehicle.id] });
  const listedVehicle = service.list(db, 'vehicles').find((row) => row.id === vehicle.id);
  assert.match(listedVehicle.assigned_order, /A-2/);
  assert.throws(() => service.create(db, 'orders', { order_number: 'A-2B', order_type: 'Einzelvertrag', customer: 'Kunde', start_location: 'Berlin', delivery_location: 'Hamburg', distance_km: 100, cargo_type: 'Pritsche', cargo_amount_fe: 10, unit_price: '1,00', status: 'in Arbeit', vehicle_ids: [vehicle.id] }), /bereits einem aktiven Auftrag|ausreichende Kapazitaet/);
  db.close();
});

test('warnt im Dashboard bei Auftrag ohne ausreichende Fahrzeugkapazitaet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdesk-'));
  const db = initializeDatabase(dir);
  service.create(db, 'orders', { order_number: 'A-2C', order_type: 'Einzelvertrag', customer: 'Kunde', start_location: 'Berlin', delivery_location: 'Hamburg', distance_km: 100, cargo_type: 'Pritsche', cargo_amount_fe: 10, unit_price: '1,00', status: 'offen', vehicle_ids: [] });
  assert.ok(service.dashboard(db).warnings.some((warning) => warning.includes('A-2C') && warning.includes('Fahrzeugkapazitaet')));
  db.close();
});

test('speichert Warnungseinstellungen und warnt nach Fahrzeugtyp-Schwellen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdesk-'));
  const db = initializeDatabase(dir);
  service.saveSettings(db, { warnings: { Lkw: { maintenanceDue: true, brakePercent: 50, enginePercent: 60, clutchPercent: 0, tirePercent: 40 }, Auflieger: { maintenanceDue: false, brakePercent: 90, enginePercent: 90, clutchPercent: 90, tirePercent: 90 } } });
  service.create(db, 'vehicles', { name: 'Lkw Warnung', license_plate: 'KS-FD-W1', vehicle_type: 'Lkw', cargo_type: 'Pritsche', capacity_fe: 5, value: '1000', current_mileage: 12000, maintenance_interval_km: 5000, last_maintenance_mileage: 5000, brake_status: 45, engine_status: 55, clutch_status: 20, tire_status: 35, has_fax: true });
  service.create(db, 'vehicles', { name: 'Auflieger ohne Warnung', license_plate: 'KS-FD-W2', vehicle_type: 'Auflieger', cargo_type: 'Pritsche', capacity_fe: 5, value: '1000', current_mileage: 12000, maintenance_interval_km: 5000, last_maintenance_mileage: 5000, brake_status: 10, tire_status: 10, has_fax: true });
  const warnings = service.dashboard(db).warnings.join('\n');
  assert.match(warnings, /Wartung bei Lkw Warnung/);
  assert.match(warnings, /Bremsenstatus bei Lkw Warnung/);
  assert.match(warnings, /Motorstatus bei Lkw Warnung/);
  assert.match(warnings, /Reifenstatus bei Lkw Warnung/);
  assert.match(warnings, /Bremsenstatus bei Auflieger ohne Warnung/);
  assert.match(warnings, /Reifenstatus bei Auflieger ohne Warnung/);
  assert.doesNotMatch(warnings, /Wartung bei Auflieger ohne Warnung/);
  db.close();
});

test('verwaltet Standorte und liefert Kartendaten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdesk-'));
  const db = initializeDatabase(dir);
  const location = service.create(db, 'locations', { name: 'Depot Berlin', address: 'Berlin', latitude: 52.52, longitude: 13.405, geocoding_status: 'ok' });
  const createdVehicle = service.create(db, 'vehicles', { name: 'Lkw Karte', license_plate: 'KS-FD 4', vehicle_type: 'Lkw', cargo_type: 'Pritsche', capacity_fe: 5, value: '1000', has_fax: true });
  const vehicle = service.update(db, 'vehicles', createdVehicle.id, { ...createdVehicle, value: '1000', location_label: location.name });
  const mapData = service.mapData(db, true);
  assert.ok(mapData.locations.some((item) => item.name === 'Depot Berlin'));
  assert.ok(mapData.vehicles.some((item) => item.id === vehicle.id && item.location_label === 'Depot Berlin'));
  db.close();
});

test('liefert Auftragsoptionen fuer Lieferschein-Uebernahme', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdesk-'));
  const db = initializeDatabase(dir);
  service.create(db, 'orders', { order_number: 'A-3', order_type: 'Einzelvertrag', customer: 'Debitor GmbH', start_location: 'Berlin', delivery_location: 'Hamburg', distance_km: 10, cargo_type: 'Tank', cargo_amount_fe: 4, unit_price: '2,50', status: 'offen', vehicle_ids: [] });
  const options = service.orderOptions(db);
  assert.equal(options[0].order_number, 'A-3');
  assert.equal(options[0].revenue_cents, 10000);
  db.close();
});

test('validiert Importdatenbank auf benoetigte Tabellen', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdesk-import-')), 'bad.sqlite');
  const db = new Database(file); db.exec('CREATE TABLE test (id INTEGER)'); db.close();
  assert.throws(() => service.validateImportDatabase(file), /vehicles/);
});
