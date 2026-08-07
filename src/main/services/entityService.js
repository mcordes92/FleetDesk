const fs = require('fs');
const path = require('path');
const { dialog, app, shell, nativeImage } = require('electron');
const Database = require('better-sqlite3');
const { createWorker } = require('tesseract.js');
const { migrate } = require('../storage/database');
const { resolveCoordinates, geocodeWithOpenStreetMap } = require('./geocodingService');
const { VEHICLE_TYPES, CARGO_TYPES, PERSONNEL_POSITIONS, ORDER_TYPES, ORDER_STATUSES, DELIVERY_NOTE_STATUSES, INVOICE_STATUSES, assertRequired, assertOneOf, assertNonNegative, assertPercent, toBool, toCents, parseLocaleNumber, calculateMaintenance, calculateRevenue, calculateInvestment, calculateProfitLoss, calculateUtilization, haversineKm, suggestVehicleCombinations } = require('../../shared/business');

const TABLES = {
  vehicles: 'vehicles', personnel: 'personnel', orders: 'orders', deliveryNotes: 'delivery_notes', invoices: 'invoices', investments: 'investments', locations: 'locations', frameworkContracts: 'framework_contracts'
};

function nowUpdate(table) { return `updated_at = CURRENT_TIMESTAMP`; }
function stripId(row) { const { id, created_at, updated_at, ...rest } = row; return rest; }

function list(db, entity) {
  ensureEntity(entity);
  if (entity === 'orders') return db.prepare(`SELECT o.*, COALESCE(group_concat(v.name || ' (' || v.license_plate || ')', ', '), '') assigned_vehicles, COALESCE(SUM(CASE WHEN a.active=1 THEN v.capacity_fe ELSE 0 END), 0) assigned_capacity_fe FROM orders o LEFT JOIN order_vehicle_assignments a ON a.order_id=o.id AND a.active=1 LEFT JOIN vehicles v ON v.id=a.vehicle_id GROUP BY o.id ORDER BY o.updated_at DESC`).all().map(enrichOrder);
  if (entity === 'vehicles') return db.prepare(`SELECT v.*, COALESCE((SELECT o.order_number || ' · ' || o.customer FROM order_vehicle_assignments a JOIN orders o ON o.id=a.order_id WHERE a.vehicle_id=v.id AND a.active=1 AND o.status!='geliefert' ORDER BY a.assigned_at DESC LIMIT 1), '') assigned_order, EXISTS(SELECT 1 FROM order_vehicle_assignments a JOIN orders o ON o.id=a.order_id WHERE a.vehicle_id=v.id AND a.active=1 AND o.status!='geliefert') has_active_assignment FROM vehicles v ORDER BY v.updated_at DESC`).all().map((row) => enrich(entity, row));
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
  if (entity === 'invoices') {
    const row = db.prepare('SELECT image_path FROM invoices WHERE id=?').get(id);
    db.prepare(`DELETE FROM ${TABLES[entity]} WHERE id = ?`).run(id);
    if (row?.image_path && fs.existsSync(row.image_path)) fs.unlinkSync(row.image_path);
    return { ok: true };
  }
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
  const handlers = { vehicles: saveVehicle, personnel: savePersonnel, orders: saveOrder, deliveryNotes: saveDeliveryNote, invoices: saveInvoice, investments: saveInvestment, locations: saveLocation, frameworkContracts: saveFrameworkContract };
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
  const row = { name: data.name.trim(), license_plate: data.license_plate.trim(), vehicle_type: data.vehicle_type, cargo_type: data.cargo_type, capacity_fe: capacity, value_cents: toCents(data.value), tank_size_liters: parseLocaleNumber(data.tank_size_liters || 0), fuel_consumption_l_100km: parseLocaleNumber(data.fuel_consumption_l_100km || 0), current_mileage: parseLocaleNumber(data.current_mileage || 0), maintenance_interval_km: parseLocaleNumber(data.maintenance_interval_km || 0), last_maintenance_mileage: parseLocaleNumber(data.last_maintenance_mileage || 0), brake_status: nullableNumber(data.brake_status), engine_status: isTrailer ? null : nullableNumber(data.engine_status), clutch_status: isTrailer ? null : nullableNumber(data.clutch_status), tire_status: nullableNumber(data.tire_status), has_fax: isTrailer ? 0 : toBool(data.has_fax), has_tank_upgrade: toBool(data.has_tank_upgrade), location_label: location.name, latitude: location.latitude, longitude: location.longitude, available: data.available === undefined ? 1 : toBool(data.available) };
  return runDbWrite(() => upsert(db, 'vehicles', id, row));
}

function savePersonnel(db, id, data) {
  assertRequired(data.personnel_number, 'Personalnummer'); assertRequired(data.name, 'Name'); assertRequired(data.hire_date, 'Einstellungsdatum'); assertOneOf(data.position, PERSONNEL_POSITIONS, 'Position'); assertNonNegative(data.salary, 'Gehalt');
  assertDate(data.hire_date, 'Einstellungsdatum');
  return runDbWrite(() => upsert(db, 'personnel', id, { personnel_number: data.personnel_number.trim(), name: data.name.trim(), hire_date: data.hire_date, salary_cents: toCents(data.salary), position: data.position, has_adr_training: data.position === 'Lkw-Fahrer' ? toBool(data.has_adr_training) : 0 }));
}

function saveOrder(db, id, data) {
  assertRequired(data.order_number, 'Auftragsnummer'); assertRequired(data.customer, 'Kunde'); assertRequired(data.start_location, 'Startort'); assertRequired(data.delivery_location, 'Lieferort'); assertOneOf(data.order_type, ORDER_TYPES, 'Auftragsart'); assertOneOf(data.cargo_type, CARGO_TYPES, 'Frachttyp'); assertOneOf(data.status, ORDER_STATUSES, 'Auftragsstatus');
  assertOneOf(data.final_stop_mode || 'zielort', ['startort', 'niederlassung', 'zielort'], 'Abstellort');
  ['distance_km','cargo_amount_fe','unit_price'].forEach((key) => assertNonNegative(data[key], key));
  const frameworkContractId = nullableNumber(data.framework_contract_id);
  const frameworkContract = data.order_type === 'Teilabruf' && frameworkContractId
    ? db.prepare('SELECT * FROM framework_contracts WHERE id=? AND active=1').get(frameworkContractId)
    : null;
  if (data.order_type === 'Teilabruf' && frameworkContractId && !frameworkContract) throw new Error('Der ausgewaehlte Rahmenvertrag ist nicht aktiv oder nicht vorhanden.');
  const customer = frameworkContract?.customer || data.customer;
  const startLocation = frameworkContract?.start_location || data.start_location;
  const deliveryLocation = frameworkContract?.delivery_location || data.delivery_location;
  const cargoType = frameworkContract?.cargo_type || data.cargo_type;
  const unitPriceCents = frameworkContract ? Number(frameworkContract.unit_price_cents || 0) : toCents(data.unit_price);
  const returnToStart = toBool(data.return_to_start);
  const finalStopMode = returnToStart ? 'startort' : (data.final_stop_mode || (data.return_to_kassel ? 'niederlassung' : 'zielort'));
  const row = { order_number: data.order_number.trim(), order_type: data.order_type, customer: String(customer).trim(), start_location: String(startLocation).trim(), delivery_location: String(deliveryLocation).trim(), return_to_kassel: toBool(finalStopMode === 'niederlassung'), return_to_start: returnToStart, final_stop_mode: finalStopMode, framework_contract_id: frameworkContractId, distance_km: parseLocaleNumber(data.distance_km || 0), delivery_deadline: data.delivery_deadline || null, adr_required: toBool(data.adr_required), delivery_date: data.order_type === 'Lagervertrag' ? (data.delivery_date || null) : null, cargo_type: cargoType, cargo_amount_fe: parseLocaleNumber(data.cargo_amount_fe || 0), unit_price_cents: unitPriceCents, status: data.status };
  if (row.delivery_deadline) assertDate(row.delivery_deadline, 'Lieferfrist');
  if (row.delivery_date) assertDate(row.delivery_date, 'Liefertermin');
  return db.transaction(() => {
    const orderId = upsert(db, 'orders', id, row);
    replaceAssignments(db, orderId, data.vehicle_ids || []);
    if (row.status === 'geliefert') releaseOrderVehicles(db, orderId);
    return orderId;
  })();
}

function saveDeliveryNote(db, id, data) {
  assertRequired(data.order_number, 'Auftragsnummer'); assertRequired(data.debtor, 'Debitor'); assertRequired(data.goods, 'Ware'); assertOneOf(data.status, DELIVERY_NOTE_STATUSES, 'Status'); assertNonNegative(data.cargo_amount_fe, 'Frachtmenge'); assertNonNegative(data.revenue, 'Umsatz');
  return runDbWrite(() => db.transaction(() => {
    const previous = id ? db.prepare('SELECT paid_at, status FROM delivery_notes WHERE id=?').get(id) : null;
    const paidAt = data.status === 'bezahlt' ? (previous?.paid_at || new Date().toISOString()) : null;
    const savedId = upsert(db, 'delivery_notes', id, { order_id: data.order_id || null, order_number: data.order_number.trim(), debtor: data.debtor.trim(), goods: data.goods.trim(), cargo_amount_fe: parseLocaleNumber(data.cargo_amount_fe || 0), revenue_cents: toCents(data.revenue), status: data.status, paid_at: paidAt });
    if (data.order_id) archiveOrder(db, data.order_id);
    return savedId;
  })());
}

function saveFrameworkContract(db, id, data) {
  assertRequired(data.contract_number, 'Rahmenvertragsnummer');
  assertRequired(data.customer, 'Kunde');
  assertRequired(data.start_location, 'Abholort');
  assertRequired(data.delivery_location, 'Lieferort');
  assertOneOf(data.cargo_type, CARGO_TYPES, 'Frachttyp');
  assertNonNegative(data.unit_price, 'Einzelpreis');
  return runDbWrite(() => upsert(db, 'framework_contracts', id, {
    contract_number: data.contract_number.trim(),
    customer: data.customer.trim(),
    start_location: data.start_location.trim(),
    delivery_location: data.delivery_location.trim(),
    cargo_type: data.cargo_type,
    unit_price_cents: toCents(data.unit_price),
    active: toBool(data.active !== false),
    notes: data.notes ? String(data.notes).trim() : null
  }));
}

function saveInvoice(db, id, data) {
  assertRequired(data.invoice_number, 'Rechnungsnummer'); assertRequired(data.creditor, 'Kreditor'); assertRequired(data.item, 'Posten'); assertRequired(data.invoice_date, 'Datum'); assertRequired(data.due_date, 'Faelligkeit'); assertOneOf(data.payment_status, INVOICE_STATUSES, 'Zahlungsstatus'); assertNonNegative(data.amount, 'Betrag');
  assertDate(data.invoice_date, 'Datum'); assertDate(data.due_date, 'Faelligkeit');
  const status = data.payment_status !== 'bezahlt' && data.due_date < new Date().toISOString().slice(0, 10) ? 'überfällig' : data.payment_status;
  const previous = id ? db.prepare('SELECT paid_at, payment_status FROM invoices WHERE id=?').get(id) : null;
  const paidAt = status === 'bezahlt' ? (previous?.paid_at || new Date().toISOString()) : null;
  const row = { invoice_number: data.invoice_number.trim(), creditor: data.creditor.trim(), item: data.item.trim(), amount_cents: toCents(data.amount), invoice_date: data.invoice_date, due_date: data.due_date, payment_status: status, paid_at: paidAt };
  if (data.image_path !== undefined) row.image_path = data.image_path || null;
  return runDbWrite(() => upsert(db, 'invoices', id, row));
}

async function analyzeInvoiceImage() {
  const selected = await selectInvoiceImage();
  if (selected.canceled) return selected;
  return analyzeInvoiceImagePath(selected.sourcePath);
}

async function selectInvoiceImage() {
  const result = await dialog.showOpenDialog({ title: 'Rechnungsbild importieren', properties: ['openFile'], filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] });
  if (result.canceled) return { canceled: true };
  return { sourcePath: result.filePaths[0] };
}

async function analyzeSelectedInvoiceImage(imagePath) {
  assertRequired(imagePath, 'Bilddatei');
  return analyzeInvoiceImagePath(imagePath);
}

async function analyzeInvoiceImagePath(imagePath) {
  const text = await recognizeInvoiceImageText(imagePath);
  return { sourcePath: imagePath, imageDataUrl: imageDataUrl(imagePath), text, parsed: parseInvoiceText(text) };
}

async function createInvoiceFromImageImport(db, data) {
  assertRequired(data.source_path, 'Bilddatei');
  const invoice = create(db, 'invoices', { ...data, image_path: null });
  const imagePath = copyInvoiceImage(invoice.id, data.source_path);
  db.prepare('UPDATE invoices SET image_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(imagePath, invoice.id);
  return get(db, 'invoices', invoice.id);
}

async function openInvoiceImage(db, id) {
  const invoice = get(db, 'invoices', id);
  if (!invoice.image_path) throw new Error('Zu dieser Eingangsrechnung ist kein Bild gespeichert.');
  if (!fs.existsSync(invoice.image_path)) throw new Error('Die gespeicherte Bilddatei wurde nicht gefunden.');
  const error = await shell.openPath(invoice.image_path);
  if (error) throw new Error(error);
  return { ok: true };
}

function invoiceImage(db, id) {
  const invoice = get(db, 'invoices', id);
  if (!invoice.image_path) throw new Error('Zu dieser Eingangsrechnung ist kein Bild gespeichert.');
  if (!fs.existsSync(invoice.image_path)) throw new Error('Die gespeicherte Bilddatei wurde nicht gefunden.');
  return { invoice_number: invoice.invoice_number, imageDataUrl: imageDataUrl(invoice.image_path) };
}

async function recognizeInvoiceImageText(imagePath) {
  const ocrImagePath = prepareOcrImage(imagePath);
  const size = nativeImage.createFromPath(ocrImagePath).getSize();
  const regions = [
    ['Kreditor Logo', rect(size, 0.06, 0.06, 0.68, 0.20)],
    ['Kopf rechts', rect(size, 0.58, 0.13, 0.40, 0.12)],
    ['Tabelle rechts', rect(size, 0.72, 0.31, 0.24, 0.50)],
    ['Warenbereich', rect(size, 0.14, 0.30, 0.62, 0.52)],
    ['Footer', rect(size, 0.25, 0.88, 0.60, 0.08)],
    ['Gesamtzeile', rect(size, 0.12, 0.78, 0.84, 0.10)],
    ['Vollbild', null]
  ];
  const parts = [];
  const worker = await createWorker('deu+eng');
  try {
    for (const [label, rectangle] of regions) {
      const text = await recognizeImageText(worker, ocrImagePath, rectangle);
      if (text.trim()) parts.push(`--- ${label} ---\n${text.trim()}`);
    }
  } finally {
    await worker.terminate();
    try { fs.unlinkSync(ocrImagePath); } catch (_error) {}
  }
  return parts.join('\n\n');
}

async function recognizeImageText(worker, imagePath, rectangle) {
  await worker.setParameters({ tessedit_pageseg_mode: rectangle ? '6' : '11', preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(imagePath, rectangle ? { rectangle } : undefined);
  return data.text || '';
}

function prepareOcrImage(imagePath) {
  const image = nativeImage.createFromPath(imagePath);
  const size = image.getSize();
  if (!size.width || !size.height) throw new Error('Das Bild konnte nicht fuer OCR geladen werden.');
  const scale = size.width < 1800 ? Math.ceil(1800 / size.width) : 2;
  const resized = image.resize({ width: size.width * scale, height: size.height * scale, quality: 'best' });
  const target = path.join(app.getPath('temp'), `fleetdesk-ocr-${Date.now()}.png`);
  fs.writeFileSync(target, resized.toPNG());
  return target;
}

function rect(size, left, top, width, height) {
  return { left: Math.round(size.width * left), top: Math.round(size.height * top), width: Math.round(size.width * width), height: Math.round(size.height * height) };
}

function parseInvoiceText(text) {
  const normalized = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const invoiceNumber = matchFirst(normalized, [/RE[-\s]*Nr\.?\s*[:;]?\s*([A-Z]{1,4}[-\s]*\d+)/i, /(RE[-\s]*\d{4,})/i]);
  const invoiceDate = parseGermanDate(matchFirst(normalized, [/RE[-\s]*Datum\s*[:;]?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i, /Datum\s*[:;]?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i]));
  const dueDate = parseGermanDate(matchFirst(normalized, [/f[äa]llig\s+am\s+(\d{1,2}\.\d{1,2}\.\d{4})/i, /Rechnungsbetrag\s+ist\s+f[äa]llig\s+am\s+(\d{1,2}\.\d{1,2}\.\d{4})/i])) || addDays(invoiceDate, 14);
  const amount = matchFirst(normalized, [/Gesamt\s*:?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/i, /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g]);
  const item = matchFirst(normalized, [/\b\d+\s+([A-Za-zÄÖÜäöüß-]+)\s+\d{1,3}(?:\.\d{3})*,\d{2}\s*€/i]) || 'Aufträge';
  const creditor = detectCreditor(lines);
  const paymentStatus = /Bezahlt/i.test(normalized) ? 'bezahlt' : 'offen';
  return { invoice_number: cleanInvoiceNumber(invoiceNumber), creditor, item, amount_cents: toCents(amount), invoice_date: invoiceDate, due_date: dueDate, payment_status: paymentStatus };
}

function detectCreditor(lines) {
  const allText = lines.join(' ');
  const known = detectKnownCreditor(allText);
  if (known) return known;
  const logoLines = extractSection(lines, 'Kreditor Logo');
  const logoKnown = detectKnownCreditor(logoLines.join(' '));
  if (logoKnown) return logoKnown;
  return logoLines.find(isCreditorCandidate) || lines.find(isCreditorCandidate) || '';
}

function detectKnownCreditor(text) {
  const normalized = normalizeOcrText(text);
  if ((normalized.includes('versicherung') || normalized.includes('versicher')) && normalized.includes('ubermut')) return 'Versicherungshaus Übermut';
  if (normalized.includes('ubermut') && normalized.includes('vertragsnummer')) return 'Versicherungshaus Übermut';
  if (normalized.includes('geldscheffel') || (normalized.includes('marketing') && normalized.includes('kommunikation'))) return 'Geldscheffel Hamburg';
  if ((normalized.includes('lkw') && normalized.includes('sim')) || normalized.includes('servicecenter')) return 'LKW-Sim Service-Center';
  if (normalized.includes('immobilienheinz') || (normalized.includes('immobilien') && normalized.includes('heinz'))) return 'Immobilien-Heinz';
  return '';
}

function normalizeOcrText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

function extractSection(lines, label) {
  const start = lines.findIndex((line) => line === `--- ${label} ---`);
  if (start < 0) return [];
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^--- .+ ---$/.test(lines[index])) break;
    if (isCreditorCandidate(lines[index])) section.push(lines[index]);
  }
  return section;
}

function isCreditorCandidate(line) {
  return !/^---|RE[-\s]*Nr|RE[-\s]*Datum|Containerdienst|Kassel|Summe|Ware|Gesamt|Menge|Wir erlauben|folgende Positionen|Vertrags[-\s]*Nummer/i.test(line)
    && !/^[\d.,\s]+€?$/.test(line)
    && !/\d{1,3}(?:\.\d{3})*,\d{2}\s*€/.test(line)
    && /[A-Za-zÄÖÜäöüß]/.test(line)
    && line.length > 3;
}

function matchFirst(text, patterns) {
  for (const pattern of patterns) {
    if (pattern.global) {
      const matches = [...String(text || '').matchAll(pattern)];
      if (matches.length) return matches[matches.length - 1][1] || matches[matches.length - 1][0];
      continue;
    }
    const match = String(text || '').match(pattern);
    if (match) return match[1] || match[0];
  }
  return '';
}

function cleanInvoiceNumber(value) { return String(value || '').replace(/\s+/g, '').replace(/^RE(\d)/i, 'RE-$1').toUpperCase(); }
function parseGermanDate(value) { const match = String(value || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : ''; }
function addDays(isoDate, days) { if (!isoDate) return ''; const date = new Date(`${isoDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function imageDataUrl(filePath) { const ext = path.extname(filePath).slice(1).toLowerCase().replace('jpg', 'jpeg') || 'png'; return `data:image/${ext};base64,${fs.readFileSync(filePath).toString('base64')}`; }
function copyInvoiceImage(invoiceId, sourcePath) {
  if (!fs.existsSync(sourcePath)) throw new Error('Die ausgewaehlte Bilddatei wurde nicht gefunden.');
  const dir = path.join(app.getPath('userData'), 'invoice-images');
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(sourcePath).toLowerCase() || '.png';
  const target = path.join(dir, `invoice-${invoiceId}${ext}`);
  fs.copyFileSync(sourcePath, target);
  return target;
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
  const mode = order.return_to_start ? 'startort' : (order.final_stop_mode || (order.return_to_kassel ? 'niederlassung' : 'zielort'));
  const location = mode === 'startort' ? order.start_location : mode === 'niederlassung' ? 'Hauptniederlassung Kassel' : order.delivery_location;
  const coords = resolveCoordinates(db, location);
  db.prepare('UPDATE order_vehicle_assignments SET active=0, released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND active=1').run(orderId);
  db.prepare('UPDATE vehicles SET available=1, location_label=?, latitude=?, longitude=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT vehicle_id FROM order_vehicle_assignments WHERE order_id=?)').run(location, coords?.latitude ?? null, coords?.longitude ?? null, orderId);
}

function vehicleOptions(db, order) {
  const start = resolveCoordinates(db, order.start_location);
  return db.prepare(`SELECT v.*, NOT EXISTS(SELECT 1 FROM order_vehicle_assignments a JOIN orders o ON o.id=a.order_id WHERE a.vehicle_id=v.id AND a.active=1 AND o.status!='geliefert') selectable FROM vehicles v ORDER BY v.name`).all().map((vehicle) => ({ ...enrich('vehicles', vehicle), distance_km: haversineKm(start, vehicle), available: Boolean(vehicle.selectable), selectable: Boolean(vehicle.selectable) }));
}

function orderOptions(db) {
  return db.prepare(`SELECT o.*, COALESCE(SUM(CASE WHEN a.active=1 THEN v.capacity_fe ELSE 0 END), 0) assigned_capacity_fe
    FROM orders o
    LEFT JOIN order_vehicle_assignments a ON a.order_id=o.id AND a.active=1
    LEFT JOIN vehicles v ON v.id=a.vehicle_id
    WHERE COALESCE(o.archived, 0)=0
      AND NOT EXISTS(SELECT 1 FROM delivery_notes d WHERE d.order_id=o.id)
    GROUP BY o.id
    ORDER BY o.updated_at DESC`).all().map((order) => {
    const enriched = enrichOrder(order);
    return { id: enriched.id, order_number: enriched.order_number, customer: enriched.customer, cargo_amount_fe: enriched.cargo_amount_fe, revenue_cents: enriched.revenue_cents, cargo_type: enriched.cargo_type };
  });
}

function frameworkContractOptions(db) {
  return db.prepare('SELECT id, contract_number, customer, start_location, delivery_location, cargo_type, unit_price_cents FROM framework_contracts WHERE active=1 ORDER BY updated_at DESC').all();
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
  const activeOrders = orders.filter((order) => !order.archived);
  const deliveryNotes = list(db, 'deliveryNotes');
  const invoices = list(db, 'invoices');
  const investments = list(db, 'investments');
  const pl = calculateProfitLoss(deliveryNotes, invoices);
  const expectedIncomeCents = deliveryNotes.filter((row) => row.status === 'warte auf Zahlungseingang').reduce((sum, row) => sum + Number(row.revenue_cents || 0), 0);
  const profitLoss = calculateProfitLossPeriods(deliveryNotes, invoices);
  const warningSettings = getSettings(db).warnings;
  return {
    metrics: {
      vehicles: vehicles.length, availableVehicles: vehicles.filter((v) => v.available).length, assignedVehicles: vehicles.filter((v) => !v.available).length, overdueMaintenance: vehicles.filter((v) => v.maintenance.remainingKm < 0).length, vehiclesWithoutFax: vehicles.filter((v) => !v.has_fax && !isTrailer(v)).length, personnel: db.prepare('SELECT COUNT(*) count FROM personnel').get().count, openOrders: activeOrders.filter((o) => o.status === 'offen').length, activeOrders: activeOrders.filter((o) => o.status === 'in Arbeit').length, storedOrders: activeOrders.filter((o) => o.status === 'eingelagert').length, expectedIncomeCents, paidIncomeCents: pl.incomeCents, paidExpenseCents: pl.expenseCents, profitLossCents: pl.resultCents, investmentCostCents: investments.reduce((sum, item) => sum + item.cost_cents, 0)
    },
    profitLoss,
    warnings: [
      ...vehicleWarnings(vehicles, warningSettings),
      ...vehicles.filter((v) => !v.has_fax && !isTrailer(v)).map((v) => `${v.name} hat kein Fax eingebaut.`),
      ...deliveryNotes.filter((n) => n.status === 'überfällig').map((n) => `Lieferschein ${n.order_number} ist ueberfaellig.`),
      ...invoices.filter((i) => i.payment_status === 'überfällig').map((i) => `Eingangsrechnung ${i.invoice_number} ist ueberfaellig.`),
      ...activeOrders.filter((o) => o.status !== 'geliefert' && Number(o.assigned_capacity_fe || 0) < Number(o.cargo_amount_fe || 0)).map((o) => `Auftrag ${o.order_number} hat keine ausreichende Fahrzeugkapazitaet.`)
    ]
  };
}

function getSettings(db) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get('settings');
  if (!row) return defaultSettings();
  try { return normalizeSettings(JSON.parse(row.value)); } catch (_error) { return defaultSettings(); }
}

function saveSettings(db, settings) {
  const normalized = normalizeSettings(settings);
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP').run('settings', JSON.stringify(normalized));
  return normalized;
}

function defaultSettings() {
  return { warnings: Object.fromEntries(VEHICLE_TYPES.map((type) => [type, { maintenanceDue: true, brakePercent: 0, enginePercent: 0, clutchPercent: 0, tirePercent: 0 }])) };
}

function normalizeSettings(settings) {
  const defaults = defaultSettings();
  const source = settings && typeof settings === 'object' ? settings : {};
  const warnings = {};
  VEHICLE_TYPES.forEach((type) => {
    const row = source.warnings?.[type] || {};
    warnings[type] = {
      maintenanceDue: row.maintenanceDue === undefined ? defaults.warnings[type].maintenanceDue : Boolean(row.maintenanceDue),
      brakePercent: clampPercent(row.brakePercent),
      enginePercent: clampPercent(row.enginePercent),
      clutchPercent: clampPercent(row.clutchPercent),
      tirePercent: clampPercent(row.tirePercent)
    };
  });
  return { warnings };
}

function vehicleWarnings(vehicles, settings) {
  return vehicles.flatMap((vehicle) => {
    const config = settings[vehicle.vehicle_type] || {};
    const warnings = [];
    if (config.maintenanceDue && vehicle.maintenance.remainingKm < 0) warnings.push(`Wartung bei ${vehicle.name} ${vehicle.maintenance.label}.`);
    addStatusWarning(warnings, vehicle, 'brake_status', 'Bremsenstatus', config.brakePercent);
    addStatusWarning(warnings, vehicle, 'engine_status', 'Motorstatus', config.enginePercent);
    addStatusWarning(warnings, vehicle, 'clutch_status', 'Kupplungsstatus', config.clutchPercent);
    addStatusWarning(warnings, vehicle, 'tire_status', 'Reifenstatus', config.tirePercent);
    return warnings;
  });
}

function addStatusWarning(warnings, vehicle, key, label, threshold) {
  if (!threshold || vehicle[key] == null) return;
  if (Number(vehicle[key]) < threshold) warnings.push(`${label} bei ${vehicle.name} unter ${threshold} Prozent (${vehicle[key]} Prozent).`);
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
    const required = ['vehicles','personnel','orders','order_vehicle_assignments','delivery_notes','invoices','investments','geocoding_cache','app_settings','schema_migrations','locations','framework_contracts'];
    const tables = new Set(imported.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    for (const table of required) if (!tables.has(table)) throw new Error(`Importdatenbank enthaelt die Tabelle ${table} nicht.`);
    const version = imported.prepare('SELECT MAX(version) version FROM schema_migrations').get().version;
    if (!version || version < 1) throw new Error('Importdatenbank hat keinen gueltigen Migrationsstand.');
    return true;
  } finally { imported.close(); }
}

function enrich(entity, row) {
  if (entity === 'vehicles') return { ...row, available: row.has_active_assignment === undefined ? Boolean(row.available) : !Boolean(row.has_active_assignment), has_fax: Boolean(row.has_fax), has_tank_upgrade: Boolean(row.has_tank_upgrade), maintenance: calculateMaintenance(row.current_mileage, row.maintenance_interval_km, row.last_maintenance_mileage) };
  if (entity === 'orders') return enrichOrder(row);
  if (entity === 'investments') { const calc = calculateInvestment(row.measure, { regional: row.scope_regional, national: row.scope_national, international: row.scope_international }); return { ...row, scope_regional: Boolean(row.scope_regional), scope_national: Boolean(row.scope_national), scope_international: Boolean(row.scope_international), success_rate: calc.successRate, cost_cents: calc.costCents }; }
  if (entity === 'frameworkContracts') return { ...row, active: Boolean(row.active) };
  return row;
}

function enrichOrder(row) {
  const returnToStart = Boolean(row.return_to_start);
  const finalStopMode = returnToStart ? 'startort' : (row.final_stop_mode || (row.return_to_kassel ? 'niederlassung' : 'zielort'));
  return { ...row, return_to_kassel: Boolean(row.return_to_kassel), return_to_start: returnToStart, final_stop_mode: finalStopMode, archived: Boolean(row.archived), adr_required: Boolean(row.adr_required), revenue_cents: calculateRevenue(row.cargo_amount_fe, row.distance_km, row.unit_price_cents), utilization: calculateUtilization(row.cargo_amount_fe, row.assigned_capacity_fe) };
}
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

function calculateProfitLossPeriods(deliveryNotes, invoices) {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = new Map();
  const years = new Map();
  deliveryNotes.filter((row) => isPaidStatus(row.status)).forEach((row) => addProfitLossEntry(months, years, row.paid_at || row.updated_at || row.created_at, Number(row.revenue_cents || 0), 0));
  invoices.filter((row) => isPaidStatus(row.payment_status)).forEach((row) => addProfitLossEntry(months, years, row.paid_at || row.updated_at || row.invoice_date || row.created_at, 0, Number(row.amount_cents || 0)));
  const monthRows = profitLossRows(months, true);
  const yearRows = profitLossRows(years, false);
  const currentMonth = monthRows.find((row) => row.key === currentKey) || { key: currentKey, label: formatPeriodLabel(currentKey, true), incomeCents: 0, expenseCents: 0, resultCents: 0 };
  return { currentMonth, months: monthRows, years: yearRows };
}

function addProfitLossEntry(months, years, dateValue, incomeCents, expenseCents) {
  const iso = String(dateValue || '').slice(0, 10);
  if (!/^\d{4}-\d{2}/.test(iso)) return;
  const monthKey = iso.slice(0, 7);
  const yearKey = iso.slice(0, 4);
  addPeriod(months, monthKey, incomeCents, expenseCents);
  addPeriod(years, yearKey, incomeCents, expenseCents);
}

function addPeriod(map, key, incomeCents, expenseCents) {
  const row = map.get(key) || { key, incomeCents: 0, expenseCents: 0 };
  row.incomeCents += incomeCents;
  row.expenseCents += expenseCents;
  map.set(key, row);
}

function profitLossRows(map, monthly) {
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key)).map((row) => ({ ...row, label: formatPeriodLabel(row.key, monthly), resultCents: row.incomeCents - row.expenseCents }));
}

function formatPeriodLabel(key, monthly) {
  if (!monthly) return key;
  const [year, month] = key.split('-');
  return `${month}.${year}`;
}

function isTrailer(vehicle) { return ['Auflieger', 'Lkw-Anhänger'].includes(vehicle.vehicle_type); }

function archiveOrder(db, orderId) {
  db.prepare('UPDATE orders SET archived=1, archived_at=COALESCE(archived_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?').run(orderId);
}

function isPaidStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'bezahlt';
}

function runDbWrite(callback) {
  try { return callback(); } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) throw new Error('Ein Datensatz mit diesem eindeutigen Wert existiert bereits.');
    throw error;
  }
}

function nullableNumber(value) { return value === '' || value === undefined || value === null ? null : parseLocaleNumber(value); }
function clampPercent(value) { const number = nullableNumber(value); return number == null || Number.isNaN(number) ? 0 : Math.min(100, Math.max(0, number)); }
function ensureEntity(entity) { if (!TABLES[entity]) throw new Error('Unbekannter Verwaltungsbereich.'); }

module.exports = { list, get, create, update, remove, dashboard, getSettings, saveSettings, vehicleOptions, suggestions, orderOptions, frameworkContractOptions, locationOptions, geocodeLocation, geocodeAddress, mapData, exportDatabase, importDatabase, backupDatabase, validateImportDatabase, relaunchApp, analyzeInvoiceImage, selectInvoiceImage, analyzeSelectedInvoiceImage, createInvoiceFromImageImport, openInvoiceImage, invoiceImage };
