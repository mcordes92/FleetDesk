const api = window.fleetDesk;
const fmt = window.formatters;
let activeEntity = 'dashboard';
let editingId = null;
let dirty = false;
let modal;
let invoiceImportModal;
let invoiceImageModal;
let invoiceImportSourcePath = '';
let vehicleChoices;
let currentSort = { key: null, direction: 1 };
let currentMap;
let startupWarningSoundPlayed = false;

const vehicleTypes = ['Lkw','Lkw-Anhänger','Sattelzugmaschine','Auflieger','Kleintransporter','Gigaliner'];

const navItems = [
  ['dashboard', 'Übersicht', 'bi-speedometer2'], ['vehicles', 'Fuhrpark', 'bi-truck'], ['personnel', 'Personal', 'bi-people'], ['frameworkContracts', 'Rahmenverträge', 'bi-file-earmark-text'], ['orders', 'Auftragsbuch', 'bi-journal-text'], ['accounting', 'Buchhaltung', 'bi-calculator'], ['investments', 'Investitionen', 'bi-graph-up-arrow'], ['locations', 'Standorte', 'bi-geo-alt'], ['map', 'Karte', 'bi-map'], ['settings', 'Einstellungen', 'bi-gear'], ['data', 'Datenverwaltung', 'bi-database']
];

const configs = {
  vehicles: { title: 'Fuhrpark', subtitle: 'Fahrzeuge, Wartung, Standorte und Verfügbarkeit', endpoint: 'vehicles', empty: 'Noch keine Fahrzeuge angelegt.', columns: [['name','Name'], ['license_plate','Kennzeichen'], ['vehicle_type','Fahrzeugtyp'], ['cargo_type','Frachttyp'], ['capacity_fe','Kapazität'], ['current_mileage','Kilometer'], ['maintenance','Nächste Wartung'], ['location_label','Standort'], ['available','Verfügbarkeit'], ['assigned_order','Zugeordneter Auftrag'], ['warning','Warnstatus']], filters: [['Alle Verfügbarkeiten',''], ['Verfügbar','available:true'], ['Im Auftrag','available:false'], ['Ohne Fax','has_fax:false'], ['Wartung überfällig','maintenance:overdue']], fields: vehicleFields },
  personnel: { title: 'Personal', subtitle: 'Mitarbeitende, Gehälter und ADR-Schulungen', endpoint: 'personnel', empty: 'Noch kein Personal angelegt.', columns: [['personnel_number','Personalnummer'], ['name','Name'], ['hire_date','Einstellung'], ['salary_cents','Gehalt'], ['position','Position'], ['has_adr_training','ADR-Schulung']], fields: personnelFields },
  frameworkContracts: { title: 'Rahmenverträge', subtitle: 'Aktive Rahmenverträge verwalten und für Teilabrufe verwenden', endpoint: 'frameworkContracts', empty: 'Noch keine Rahmenverträge angelegt.', columns: [['contract_number','Vertragsnummer'], ['customer','Kunde'], ['start_location','Abholort'], ['delivery_location','Lieferort'], ['cargo_type','Frachttyp'], ['unit_price_cents','Einzelpreis'], ['active','Aktiv']], filters: [['Alle Verträge',''], ['Aktiv','active:true'], ['Inaktiv','active:false']], fields: frameworkContractFields },
  orders: { title: 'Auftragsbuch', subtitle: 'Aufträge, Fahrzeugzuordnungen und Auslastung', endpoint: 'orders', empty: 'Noch keine Aufträge angelegt.', columns: [['order_number','Auftragsnummer'], ['order_type','Auftragsart'], ['customer','Kunde'], ['start_location','Startort'], ['delivery_location','Lieferort'], ['final_stop_mode','Abstellort'], ['distance_km','Entfernung'], ['cargo_type','Frachttyp'], ['cargo_amount_fe','Frachtmenge'], ['revenue_cents','Gesamtumsatz'], ['status','Status'], ['archived','Archiv'], ['assigned_vehicles','Fahrzeuge'], ['utilization','Auslastung']], filters: [['Aktive Aufträge','archived:false'], ['Archivierte Aufträge','archived:true'], ['Alle Aufträge',''], ['Offen','status:offen'], ['In Arbeit','status:in Arbeit'], ['Eingelagert','status:eingelagert'], ['Geliefert','status:geliefert'], ['Kapazität unzureichend','capacity:insufficient']], fields: orderFields },
  deliveryNotes: { title: 'Lieferscheine', subtitle: 'Debitoren, Umsätze und Zahlungsstatus', endpoint: 'deliveryNotes', empty: 'Noch keine Lieferscheine angelegt.', columns: [['order_number','Auftragsnummer'], ['debtor','Debitor'], ['goods','Ware'], ['cargo_amount_fe','Frachtmenge'], ['revenue_cents','Umsatz'], ['status','Status']], fields: deliveryNoteFields },
  invoices: { title: 'Eingangsrechnungen', subtitle: 'Kreditoren, Beträge und Fälligkeiten', endpoint: 'invoices', empty: 'Noch keine Eingangsrechnungen angelegt.', columns: [['invoice_number','Rechnungsnummer'], ['creditor','Kreditor'], ['item','Posten'], ['amount_cents','Betrag'], ['invoice_date','Datum'], ['due_date','Fälligkeit'], ['payment_status','Zahlungsstatus']], fields: invoiceFields },
  investments: { title: 'Investitionen', subtitle: 'Werbemassnahmen, Erfolgsquoten und Kosten', endpoint: 'investments', empty: 'Noch keine Investitionen angelegt.', columns: [['measure','Massnahme'], ['scope','Werbeumfang'], ['success_rate','Erfolgsquote'], ['cost_cents','Kosten']], fields: investmentFields },
  locations: { title: 'Standorte', subtitle: 'Standorte pflegen und Koordinaten ueber OpenStreetMap ermitteln', endpoint: 'locations', empty: 'Noch keine Standorte angelegt.', columns: [['name','Standort'], ['address','Adresse'], ['coordinates','Koordinaten'], ['geocoding_status','Geocoding']], filters: [['Alle Standorte',''], ['Mit Koordinaten','coordinates:ok'], ['Ohne Koordinaten','coordinates:missing']], fields: locationFields }
};

document.addEventListener('DOMContentLoaded', () => {
  modal = new bootstrap.Modal(document.getElementById('recordModal'));
  invoiceImportModal = new bootstrap.Modal(document.getElementById('invoiceImportModal'));
  invoiceImageModal = new bootstrap.Modal(document.getElementById('invoiceImageModal'));
  document.getElementById('recordModal').addEventListener('hidden.bs.modal', destroyVehicleChoices);
  document.getElementById('invoiceImportForm').addEventListener('submit', saveInvoiceImport);
  renderNavigation();
  document.getElementById('recordForm').addEventListener('submit', saveForm);
  window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  showDashboard();
});

function renderNavigation() {
  document.getElementById('navigation').innerHTML = navItems.map(([key, label, icon]) => `<button class="nav-link text-start" data-nav="${key}"><i class="bi ${icon} me-2"></i>${label}</button>`).join('');
  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.nav)));
}

function navigate(key) {
  if (dirty && !confirm('Es gibt ungespeicherte Formularänderungen. Ansicht trotzdem wechseln?')) return;
  dirty = false; activeEntity = key;
  document.querySelectorAll('[data-nav]').forEach((button) => button.classList.toggle('active', button.dataset.nav === key));
  if (key === 'dashboard') return showDashboard();
  if (key === 'accounting') return showAccounting();
  if (key === 'map') return showMap();
  if (key === 'settings') return showSettings();
  if (key === 'data') return showDataManagement();
  return showEntity(configs[key]);
}

async function call(promise) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function showDashboard() {
  activeEntity = 'dashboard'; setTitle('Übersicht', 'Kennzahlen und Warnungen');
  const data = await call(api.dashboard());
  playStartupWarningSound(data.warnings);
  const metricLabels = { vehicles: 'Fahrzeuge', availableVehicles: 'Verfügbar', assignedVehicles: 'Im Auftrag', overdueMaintenance: 'Wartung überfällig', vehiclesWithoutFax: 'Ohne Fax', personnel: 'Mitarbeiter', openOrders: 'Offene Aufträge', activeOrders: 'In Arbeit', storedOrders: 'Eingelagert', expectedIncomeCents: 'Erwarteter Gewinn', paidIncomeCents: 'Bezahlte Einnahmen', paidExpenseCents: 'Bezahlte Aufwendungen', profitLossCents: 'Gewinn/Verlust', investmentCostCents: 'Investitionen' };
  document.getElementById('view').innerHTML = `<div class="row g-3">${Object.entries(data.metrics).map(([key, value]) => `<div class="col-12 col-md-6 col-xl-3"><div class="card metric h-100"><div class="card-body"><div class="text-secondary small">${metricLabels[key]}</div><div class="fs-3 fw-bold">${key.endsWith('Cents') ? fmt.money(value) : fmt.number(value)}</div></div></div></div>`).join('')}</div><div class="card mt-4"><div class="card-header"><i class="bi bi-exclamation-triangle me-2"></i>Wichtige Warnungen</div><div class="card-body">${data.warnings.length ? `<ul class="mb-0">${data.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="empty-state">Keine aktuellen Warnungen.</div>'}</div></div>`;
}

async function showSettings() {
  activeEntity = 'settings'; setTitle('Einstellungen', 'Warnungen und Anwendungsvorgaben');
  const settings = await call(api.getSettings());
  document.getElementById('view').innerHTML = `<div class="card"><div class="card-body"><ul class="nav nav-tabs" role="tablist"><li class="nav-item" role="presentation"><button class="nav-link active" id="warnings-tab" data-bs-toggle="tab" data-bs-target="#warningsPane" type="button" role="tab">Warnungen</button></li></ul><div class="tab-content pt-3"><div class="tab-pane fade show active" id="warningsPane" role="tabpanel" aria-labelledby="warnings-tab"><form id="warningSettingsForm"><p class="text-secondary">Schwellenwert 0 deaktiviert die jeweilige Statuswarnung. Wartungswarnungen gelten pro Fahrzeugtyp separat.</p><div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead><tr><th>Fahrzeugtyp</th><th>Fällige Wartung</th><th>Bremsen unter %</th><th>Motor unter %</th><th>Kupplung unter %</th><th>Reifen unter %</th></tr></thead><tbody>${vehicleTypes.map((type) => warningSettingsRow(type, settings.warnings[type] || {})).join('')}</tbody></table></div><div class="d-flex justify-content-end mt-3"><button type="submit" class="btn btn-primary"><i class="bi bi-save"></i> Einstellungen speichern</button></div></form></div></div></div></div>`;
  document.getElementById('warningSettingsForm').addEventListener('submit', saveWarningSettings);
}

function warningSettingsRow(type, row) {
  return `<tr data-vehicle-type="${escapeHtml(type)}"><td class="fw-semibold">${escapeHtml(type)}</td><td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="maintenanceDue" ${row.maintenanceDue ? 'checked' : ''}></div></td><td>${thresholdInput('brakePercent', row.brakePercent)}</td><td>${thresholdInput('enginePercent', row.enginePercent)}</td><td>${thresholdInput('clutchPercent', row.clutchPercent)}</td><td>${thresholdInput('tirePercent', row.tirePercent)}</td></tr>`;
}

function thresholdInput(name, value) {
  return `<input class="form-control form-control-sm" type="number" min="0" max="100" step="any" inputmode="decimal" name="${name}" value="${escapeHtml(value ?? 0)}">`;
}

async function saveWarningSettings(event) {
  event.preventDefault();
  const warnings = {};
  document.querySelectorAll('#warningSettingsForm [data-vehicle-type]').forEach((row) => {
    warnings[row.dataset.vehicleType] = {
      maintenanceDue: row.querySelector('[name="maintenanceDue"]').checked,
      brakePercent: inputNumber(row.querySelector('[name="brakePercent"]').value),
      enginePercent: inputNumber(row.querySelector('[name="enginePercent"]').value),
      clutchPercent: inputNumber(row.querySelector('[name="clutchPercent"]').value),
      tirePercent: inputNumber(row.querySelector('[name="tirePercent"]').value)
    };
  });
  await call(api.saveSettings({ warnings }));
  toast('Einstellungen wurden gespeichert.', 'success');
}

function showAccounting() {
  setTitle('Buchhaltung', 'Lieferscheine, Eingangsrechnungen und Gewinn- und Verlustrechnung');
  document.getElementById('view').innerHTML = `<div class="d-flex gap-2 mb-3"><button class="btn btn-primary" data-section="deliveryNotes">Lieferscheine</button><button class="btn btn-outline-light" data-section="invoices">Eingangsrechnungen</button><button class="btn btn-outline-info" id="plBtn">GuV aktualisieren</button></div><div id="accountingView"></div>`;
  document.querySelectorAll('[data-section]').forEach((btn) => btn.addEventListener('click', () => showEntity(configs[btn.dataset.section], 'accountingView')));
  document.getElementById('plBtn').addEventListener('click', showProfitLoss);
  showEntity(configs.deliveryNotes, 'accountingView');
}

async function showProfitLoss() {
  const dash = await call(api.dashboard());
  const current = dash.profitLoss.currentMonth;
  document.getElementById('accountingView').innerHTML = `<div class="row g-3"><div class="col-md-4"><div class="card"><div class="card-body"><div class="text-secondary">Einnahmen aktueller Monat</div><div class="fs-3">${fmt.money(current.incomeCents)}</div></div></div></div><div class="col-md-4"><div class="card"><div class="card-body"><div class="text-secondary">Aufwendungen aktueller Monat</div><div class="fs-3">${fmt.money(current.expenseCents)}</div></div></div></div><div class="col-md-4"><div class="card"><div class="card-body"><div class="text-secondary">GuV aktueller Monat</div><div class="fs-3 ${current.resultCents < 0 ? 'text-danger' : 'text-success'}">${fmt.money(current.resultCents)}</div></div></div></div></div><div class="row g-3 mt-1"><div class="col-lg-7"><div class="card h-100"><div class="card-header">Monatsstatistik</div><div class="card-body p-0">${profitLossTable(dash.profitLoss.months, 'Monat')}</div></div></div><div class="col-lg-5"><div class="card h-100"><div class="card-header">Jahresstatistik</div><div class="card-body p-0">${profitLossTable(dash.profitLoss.years, 'Jahr')}</div></div></div></div>`;
}

function profitLossTable(rows, label) {
  if (!rows.length) return '<div class="empty-state m-3">Keine bezahlten Einnahmen oder Aufwendungen vorhanden.</div>';
  return `<div class="table-responsive border-0"><table class="table table-hover align-middle mb-0"><thead><tr><th>${label}</th><th>Einnahmen</th><th>Aufwendungen</th><th>Ergebnis</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${fmt.money(row.incomeCents)}</td><td>${fmt.money(row.expenseCents)}</td><td class="${row.resultCents < 0 ? 'text-danger' : 'text-success'}">${fmt.money(row.resultCents)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function showEntity(config, targetId = 'view') {
  setTitle(config.title, config.subtitle);
  const rows = await call(api.list(config.endpoint));
  currentSort = { key: config.columns[0][0], direction: 1 };
  const filters = config.filters || [['Alle Datensätze','']];
  const importButton = config.endpoint === 'invoices' ? '<button class="btn btn-outline-info" id="invoiceImageImport"><i class="bi bi-file-earmark-image"></i> Bild importieren</button>' : '';
  document.getElementById(targetId).innerHTML = `<div class="card"><div class="card-body"><div class="d-flex flex-wrap gap-2 justify-content-between mb-3"><input class="form-control w-auto flex-grow-1" id="searchInput" placeholder="Suchen..."><select class="form-select w-auto" id="filterInput">${filters.map(([label, value]) => `<option value="${escapeHtml(value)}">${label}</option>`).join('')}</select>${importButton}<button class="btn btn-primary" id="newRecord"><i class="bi bi-plus-lg"></i> Neuer Datensatz</button></div><div id="tableHost"></div></div></div>`;
  document.getElementById('newRecord').addEventListener('click', () => openForm(config, null));
  document.getElementById('invoiceImageImport')?.addEventListener('click', openInvoiceImport);
  const render = () => renderTable(config, sortRows(filterRows(rows, document.getElementById('searchInput').value, document.getElementById('filterInput').value)), targetId);
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('filterInput').addEventListener('change', render);
  render();
}

function renderTable(config, rows, targetId) {
  const host = document.querySelector(`#${targetId} #tableHost`);
  if (!rows.length) { host.innerHTML = `<div class="empty-state">${config.empty}</div>`; return; }
  host.innerHTML = `<div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead><tr>${config.columns.map(([key, label]) => `<th><button class="btn btn-link btn-sm p-0 text-decoration-none text-light" data-sort="${key}">${label}${currentSort.key === key ? (currentSort.direction > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}<th>Aktionen</th></tr></thead><tbody>${rows.map((row) => `<tr>${config.columns.map(([key]) => `<td>${cell(row, key)}</td>`).join('')}<td class="text-nowrap">${config.endpoint === 'invoices' && row.image_path ? `<button class="btn btn-sm btn-outline-info me-1" data-open-image="${row.id}" title="Rechnungsbild öffnen"><i class="bi bi-image"></i></button>` : ''}<button class="btn btn-sm btn-outline-light me-1" data-edit="${row.id}"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" data-delete="${row.id}"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`;
  host.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => { currentSort = { key: button.dataset.sort, direction: currentSort.key === button.dataset.sort ? currentSort.direction * -1 : 1 }; document.getElementById('searchInput').dispatchEvent(new Event('input')); }));
  host.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', async () => openForm(config, await call(api.get(config.endpoint, button.dataset.edit)))));
  host.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteRecord(config, button.dataset.delete)));
  host.querySelectorAll('[data-open-image]').forEach((button) => button.addEventListener('click', () => openInvoiceImage(button.dataset.openImage)));
}

async function openInvoiceImport() {
  try {
    const selected = await call(api.selectInvoiceImage());
    if (selected.canceled) return;
    showLoading('OCR läuft', 'Das Rechnungsbild wird analysiert. Bitte warten...');
    const result = await call(api.analyzeSelectedInvoiceImage(selected.sourcePath));
    invoiceImportSourcePath = result.sourcePath;
    document.getElementById('invoiceImportPreview').src = result.imageDataUrl;
    document.getElementById('invoiceImportText').textContent = result.text || 'Kein OCR-Text erkannt.';
    document.getElementById('invoiceImportFields').innerHTML = invoiceFields(result.parsed || {}).map(importFieldHtml).join('');
    invoiceImportModal.show();
  } catch (error) { toast(error.message, 'danger'); }
  finally { hideLoading(); }
}

function importFieldHtml(field) {
  return fieldHtml({ ...field, w: 12 });
}

async function saveInvoiceImport(event) {
  event.preventDefault();
  try {
    const data = invoiceImportData();
    await call(api.createInvoiceFromImage(data));
    invoiceImportModal.hide();
    toast('Eingangsrechnung wurde aus dem Bild importiert.', 'success');
    showEntity(configs.invoices, activeEntity === 'accounting' ? 'accountingView' : 'view');
  } catch (error) { toast(error.message, 'danger'); }
}

function invoiceImportData() {
  const data = { source_path: invoiceImportSourcePath };
  document.querySelectorAll('#invoiceImportForm input, #invoiceImportForm select').forEach((el) => { if (el.name) data[el.name] = el.value; });
  return data;
}

async function openInvoiceImage(id) {
  try {
    const result = await call(api.invoiceImage(id));
    document.getElementById('invoiceImageTitle').textContent = `Rechnungsbild ${result.invoice_number || ''}`.trim();
    document.getElementById('invoiceImagePreview').src = result.imageDataUrl;
    invoiceImageModal.show();
  } catch (error) { toast(error.message, 'danger'); }
}

function showLoading(title, text) {
  document.getElementById('loadingTitle').textContent = title || 'Bitte warten';
  document.getElementById('loadingText').textContent = text || 'Vorgang läuft...';
  document.getElementById('loadingOverlay').classList.remove('d-none');
  document.getElementById('loadingOverlay').classList.add('d-flex');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('d-none');
  document.getElementById('loadingOverlay').classList.remove('d-flex');
}

function filterRows(rows, search, filter) {
  const term = String(search || '').toLowerCase();
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term)).filter((row) => {
    if (!filter) return true;
    if (filter === 'available:true') return row.available;
    if (filter === 'available:false') return !row.available;
    if (filter === 'has_fax:false') return !row.has_fax && !isTrailer(row);
    if (filter === 'maintenance:overdue') return row.maintenance?.remainingKm < 0;
    if (filter === 'capacity:insufficient') return Number(row.assigned_capacity_fe || 0) < Number(row.cargo_amount_fe || 0) && row.status !== 'geliefert';
    if (filter === 'coordinates:ok') return row.latitude != null && row.longitude != null;
    if (filter === 'coordinates:missing') return row.latitude == null || row.longitude == null;
    if (filter === 'active:true') return row.active;
    if (filter === 'active:false') return !row.active;
    if (filter === 'archived:true') return row.archived;
    if (filter === 'archived:false') return !row.archived;
    if (filter.startsWith('status:')) return row.status === filter.slice(7);
    return true;
  });
}

function sortRows(rows) {
  const { key, direction } = currentSort;
  return [...rows].sort((a, b) => compareValue(sortValue(a, key), sortValue(b, key)) * direction);
}

function sortValue(row, key) {
  if (key === 'maintenance') return row.maintenance?.remainingKm ?? 0;
  return row[key] ?? '';
}

function compareValue(a, b) {
  if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'de');
}

function cell(row, key) {
  if (key.includes('cents')) return fmt.money(row[key]);
  if (key.includes('date') || key.includes('deadline')) return fmt.date(row[key]);
  if (key === 'available') return badge(row.available ? 'verfügbar' : 'im Auftrag', row.available ? 'success' : 'warning');
  if (key === 'active') return badge(row.active ? 'aktiv' : 'inaktiv', row.active ? 'success' : 'secondary');
  if (key === 'archived') return badge(row.archived ? 'archiviert' : 'aktiv', row.archived ? 'secondary' : 'success');
  if (key === 'has_adr_training') return fmt.bool(row[key]);
  if (key === 'maintenance') return row.maintenance ? badge(row.maintenance.label, row.maintenance.remainingKm < 0 ? 'danger' : 'success') : '';
  if (key === 'warning') return !row.has_fax && !isTrailer(row) ? badge('Kein Fax', 'warning') : badge('OK', 'success');
  if (key === 'revenue_cents' || key === 'amount_cents' || key === 'salary_cents' || key === 'cost_cents') return fmt.money(row[key]);
  if (key === 'success_rate') return fmt.percent(row[key]);
  if (key === 'coordinates') return row.latitude == null || row.longitude == null ? badge('Nicht geocodiert', 'warning') : `${fmt.number(row.latitude, 5)}, ${fmt.number(row.longitude, 5)}`;
  if (key === 'geocoding_status') return badge(row[key] || 'unbekannt', row[key] === 'ok' ? 'success' : 'warning');
  if (key === 'scope') return ['Regional','National','International'].filter((label) => row[`scope_${label.toLowerCase()}`]).join(', ');
  if (key === 'utilization') return row.assigned_capacity_fe ? badge(fmt.percent(row.utilization), row.utilization > 100 ? 'warning' : 'info') : badge('Keine Kapazität', 'secondary');
  if (key === 'final_stop_mode') {
    if (row.final_stop_mode === 'startort') return 'Startort';
    if (row.final_stop_mode === 'niederlassung') return 'Niederlassung';
    return 'Zielort';
  }
  return escapeHtml(row[key] ?? '');
}

function openForm(config, row) {
  editingId = row?.id || null; dirty = false;
  document.getElementById('modalTitle').textContent = editingId ? `${config.title} bearbeiten` : `${config.title} anlegen`;
  const form = document.getElementById('recordForm');
  document.getElementById('formFields').innerHTML = config.fields(row || {}).map(fieldHtml).join('');
  form.dataset.entity = config.endpoint;
  form.dataset.config = Object.keys(configs).find((key) => configs[key] === config) || config.endpoint;
  form.querySelectorAll('input, select, textarea').forEach((input) => {
    input.addEventListener('input', () => { dirty = true; applyDynamicRules(); });
    input.addEventListener('change', () => { dirty = true; applyDynamicRules(); });
  });
  applyDynamicRules();
  if (config.endpoint === 'orders') {
    initChoices(row).catch((error) => toast(error.message, 'danger'));
    initFrameworkContractSelect().catch((error) => toast(error.message, 'danger'));
  }
  if (config.endpoint === 'deliveryNotes') initOrderSelect().catch((error) => toast(error.message, 'danger'));
  if (config.endpoint === 'vehicles') initLocationSelect().catch((error) => toast(error.message, 'danger'));
  if (config.endpoint === 'locations') initModalGeocode();
  modal.show();
}

function fieldHtml(field) {
  const required = field.required ? 'required' : '';
  const value = field.value ?? '';
  if (field.type === 'checkbox') return `<div class="col-md-4"><div class="form-check mt-4"><input class="form-check-input" type="checkbox" id="${field.name}" name="${field.name}" ${value ? 'checked' : ''}><label class="form-check-label" for="${field.name}">${field.label}</label></div></div>`;
  if (field.type === 'select') return `<div class="col-md-${field.w || 4}"><label class="form-label">${field.label}${field.required ? ' *' : ''}</label><select class="form-select" name="${field.name}" ${required}>${field.options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>`;
  if (field.type === 'orderselect') return `<div class="col-md-${field.w || 4}"><label class="form-label">${field.label}</label><select class="form-select" name="${field.name}" data-current="${escapeHtml(value)}"><option value="">Manuelle Eingabe</option></select></div>`;
  if (field.type === 'contractselect') return `<div class="col-md-${field.w || 4}"><label class="form-label">${field.label}</label><select class="form-select" name="${field.name}" data-current="${escapeHtml(value)}"><option value="">Kein Rahmenvertrag</option></select><div class="form-text">Bei Teilabruf werden Kunde, Orte, Frachttyp und Einzelpreis aus dem Vertrag übernommen.</div></div>`;
  if (field.type === 'locationselect') return `<div class="col-md-${field.w || 4}"><label class="form-label">${field.label}${field.required ? ' *' : ''}</label><select class="form-select" name="${field.name}" data-current="${escapeHtml(value)}" ${required}></select><div class="form-text">Standorte werden in der Standortverwaltung gepflegt.</div></div>`;
  if (field.type === 'hidden') return `<input type="hidden" name="${field.name}" value="${escapeHtml(value)}">`;
  if (field.type === 'geocodebutton') return `<div class="col-md-${field.w || 4} d-flex align-items-end"><button type="button" class="btn btn-outline-info w-100" id="modalGeocode"><i class="bi bi-crosshair"></i> Adresse suchen</button></div>`;
  if (field.type === 'multiselect') return `<div class="col-12"><label class="form-label">${field.label}</label><select class="form-select" name="${field.name}" multiple></select><div id="suggestions" class="small text-secondary mt-2"></div></div>`;
  if (field.type === 'calculated') return `<div class="col-md-${field.w || 4}"><label class="form-label">${field.label}</label><input class="form-control" name="${field.name}" value="${escapeHtml(value)}" readonly></div>`;
  if (field.type === 'textarea') return `<div class="col-md-${field.w || 12}"><label class="form-label">${field.label}${field.required ? ' *' : ''}</label><textarea class="form-control" name="${field.name}" rows="3" ${required}>${escapeHtml(value)}</textarea></div>`;
  const step = field.step ? `step="${escapeHtml(field.step)}" inputmode="decimal"` : '';
  return `<div class="col-md-${field.w || 4}"><label class="form-label">${field.label}${field.required ? ' *' : ''}</label><input class="form-control" type="${field.type || 'text'}" name="${field.name}" value="${escapeHtml(value)}" ${required} ${field.readonly ? 'readonly' : ''} ${step}></div>`;
}

async function initChoices(row) {
  destroyVehicleChoices();
  const select = document.querySelector('select[name="vehicle_ids"]');
  if (!select) return;
  const order = formData();
  const vehicles = await call(api.vehicleOptions(order));
  select.innerHTML = vehicles.map((vehicle) => {
    const selected = (row?.vehicle_ids || []).includes(vehicle.id);
    return `<option value="${vehicle.id}" ${selected ? 'selected' : ''} ${vehicle.selectable || selected ? '' : 'disabled'}>${vehicle.name} · ${vehicle.license_plate} · ${vehicle.vehicle_type} · ${vehicle.cargo_type} · ${vehicle.capacity_fe ?? '-'} FE · ${vehicle.location_label} · ${vehicle.distance_km == null ? 'Entfernung unbekannt' : fmt.number(vehicle.distance_km, 1) + ' km Luftlinie'} · ${vehicle.selectable || selected ? 'verfügbar' : 'nicht verfügbar'}</option>`;
  }).join('');
  vehicleChoices = new Choices(select, { removeItemButton: true, shouldSort: false, searchEnabled: true, searchPlaceholderValue: 'Fahrzeug suchen', itemSelectText: 'Auswählen', noResultsText: 'Keine Fahrzeuge gefunden', noChoicesText: 'Keine Fahrzeuge verfügbar', position: 'bottom', maxItemCount: -1, renderChoiceLimit: -1, searchResultLimit: 50 });
  vehicleChoices.hideDropdown();
  const suggestions = await call(api.suggestVehicles(order));
  document.getElementById('suggestions').innerHTML = suggestions.length ? suggestions.map((item) => `${item.sufficient ? 'Ausreichend' : 'Unzureichend'}: ${item.vehicles.map((v) => v.name).join(', ')} · ${fmt.number(item.capacity, 0)} FE · ${fmt.percent(item.utilization)}`).join('<br>') : 'Keine passenden Fahrzeugvorschläge vorhanden.';
}

function destroyVehicleChoices() {
  if (!vehicleChoices) return;
  vehicleChoices.destroy();
  vehicleChoices = null;
}

async function initOrderSelect() {
  const select = document.querySelector('select[name="order_id"]');
  if (!select || !select.hasAttribute('data-current')) return;
  const orders = await call(api.orderOptions());
  const current = select.dataset.current;
  select.innerHTML += orders.map((order) => `<option value="${order.id}" ${String(order.id) === current ? 'selected' : ''} data-order="${escapeHtml(JSON.stringify(order))}">${order.order_number} · ${order.customer} · ${fmt.money(order.revenue_cents)}</option>`).join('');
  select.addEventListener('change', () => {
    const option = select.selectedOptions[0];
    if (!option?.dataset.order) return;
    const order = JSON.parse(option.dataset.order);
    setInput('order_number', order.order_number);
    setInput('debtor', order.customer);
    setInput('goods', order.cargo_type);
    setInput('cargo_amount_fe', order.cargo_amount_fe);
    setInput('revenue', fmt.inputMoney(order.revenue_cents));
    dirty = true;
  });
}

async function initFrameworkContractSelect() {
  const select = document.querySelector('select[name="framework_contract_id"]');
  if (!select || !select.hasAttribute('data-current')) return;
  const contracts = await call(api.frameworkContractOptions());
  const current = select.dataset.current;
  select.innerHTML += contracts.map((contract) => `<option value="${contract.id}" ${String(contract.id) === current ? 'selected' : ''} data-contract="${escapeHtml(JSON.stringify(contract))}">${escapeHtml(contract.contract_number)} · ${escapeHtml(contract.customer)} · ${fmt.money(contract.unit_price_cents)}</option>`).join('');
  select.addEventListener('change', () => {
    const option = select.selectedOptions[0];
    if (!option?.dataset.contract) return;
    const contract = JSON.parse(option.dataset.contract);
    setInput('customer', contract.customer);
    setInput('start_location', contract.start_location);
    setInput('delivery_location', contract.delivery_location);
    setInput('cargo_type', contract.cargo_type);
    setInput('unit_price', fmt.inputMoney(contract.unit_price_cents));
    dirty = true;
    applyDynamicRules();
  });
}

async function initLocationSelect() {
  const select = document.querySelector('select[name="location_label"]');
  if (!select || !select.hasAttribute('data-current')) return;
  const locations = await call(api.locationOptions());
  const current = select.dataset.current || 'Hauptniederlassung Kassel';
  select.innerHTML = locations.map((location) => `<option value="${escapeHtml(location.name)}" ${location.name === current ? 'selected' : ''} ${location.latitude == null || location.longitude == null ? 'disabled' : ''}>${escapeHtml(location.name)} · ${escapeHtml(location.address)}${location.latitude == null || location.longitude == null ? ' · nicht geocodiert' : ''}</option>`).join('');
}

function initModalGeocode() {
  const button = document.getElementById('modalGeocode');
  if (!button) return;
  button.addEventListener('click', async () => {
    const address = document.querySelector('[name="address"]')?.value;
    try {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Suche läuft...';
      const result = await call(api.geocodeAddress(address));
      setInput('latitude', result.latitude);
      setInput('longitude', result.longitude);
      setInput('geocoding_status', result.geocoding_status);
      setInput('coordinate_preview', `${fmt.number(result.latitude, 5)}, ${fmt.number(result.longitude, 5)}`);
      dirty = true;
      toast('Adresse wurde ueber OpenStreetMap gefunden.', 'success');
    } catch (error) {
      setInput('geocoding_status', 'nicht gefunden');
      toast(error.message, 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="bi bi-crosshair"></i> Adresse suchen';
    }
  });
}

function applyDynamicRules() {
  const data = formData();
  const capacity = document.querySelector('[name="capacity_fe"]');
  if (capacity) { capacity.disabled = data.vehicle_type === 'Sattelzugmaschine'; if (capacity.disabled) capacity.value = ''; }
  const fax = document.querySelector('[name="has_fax"]');
  if (fax) { fax.disabled = ['Auflieger','Lkw-Anhänger'].includes(data.vehicle_type); if (fax.disabled) fax.checked = false; }
  ['engine_status','clutch_status'].forEach((name) => { const input = document.querySelector(`[name="${name}"]`); if (input) { input.disabled = ['Auflieger','Lkw-Anhänger'].includes(data.vehicle_type); if (input.disabled) input.value = ''; } });
  const adr = document.querySelector('[name="has_adr_training"]'); if (adr) { adr.disabled = data.position !== 'Lkw-Fahrer'; if (adr.disabled) adr.checked = false; }
  const deliveryDate = document.querySelector('[name="delivery_date"]'); if (deliveryDate) { deliveryDate.disabled = data.order_type !== 'Lagervertrag'; if (deliveryDate.disabled) deliveryDate.value = ''; }
  const contractSelect = document.querySelector('[name="framework_contract_id"]'); if (contractSelect) { contractSelect.disabled = data.order_type !== 'Teilabruf'; if (contractSelect.disabled) contractSelect.value = ''; }
  const returnToStart = document.querySelector('[name="return_to_start"]');
  const finalStop = document.querySelector('[name="final_stop_mode"]');
  if (returnToStart && finalStop) {
    finalStop.disabled = returnToStart.checked;
    if (returnToStart.checked) finalStop.value = 'startort';
  }
  const maintenance = document.querySelector('[name="maintenance_preview"]'); if (maintenance) maintenance.value = maintenancePreview(data);
  const revenue = document.querySelector('[name="revenue_preview"]'); if (revenue) revenue.value = fmt.money(Math.round(inputNumber(data.cargo_amount_fe) * inputNumber(data.distance_km) * inputMoneyCents(data.unit_price)));
  const investment = document.querySelector('[name="investment_preview"]'); if (investment) investment.value = investmentPreview(data);
  const hint = document.getElementById('formHint'); if (hint) hint.innerHTML = data.has_fax === false && document.querySelector('[name="has_fax"]') ? '<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> Dieses Fahrzeug hat kein Fax eingebaut. Speichern ist trotzdem erlaubt.</div>' : '';
}

function maintenancePreview(data) {
  const next = inputNumber(data.last_maintenance_mileage) + inputNumber(data.maintenance_interval_km);
  const remaining = next - inputNumber(data.current_mileage);
  return remaining < 0 ? `Überfällig seit ${fmt.number(Math.abs(remaining))} km` : `${fmt.number(remaining)} km`;
}

function investmentPreview(data) {
  const presets = { Flyer: [1, 50000], Tageszeitung: [5, 250000], Radiowerbung: [10, 1000000], Filmwerbung: [25, 5000000], Fernsehwerbung: [40, 15000000], 'große Werbekampagne': [100, 50000000] };
  const preset = presets[data.measure];
  if (!preset) return '';
  const scopes = ['scope_regional', 'scope_national', 'scope_international'].filter((key) => data[key]).length;
  return `${fmt.percent(preset[0])} · ${fmt.money(preset[1] * scopes)}`;
}

async function saveForm(event) {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const entity = form.dataset.entity;
    const data = formData();
    if (editingId) await call(api.update(entity, editingId, data)); else await call(api.create(entity, data));
    dirty = false; modal.hide(); toast('Datensatz wurde gespeichert.', 'success');
    if (activeEntity === 'accounting') showAccounting(); else if (activeEntity === 'dashboard') showDashboard(); else showEntity(configs[activeEntity]);
  } catch (error) { toast(error.message, 'danger'); }
}

function formData() {
  const form = document.getElementById('recordForm'); const data = {};
  form.querySelectorAll('input, select').forEach((el) => {
    if (!el.name || el.disabled) return;
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else if (el.multiple) data[el.name] = Array.from(el.selectedOptions).map((option) => Number(option.value));
    else data[el.name] = el.value;
  });
  ['has_fax','has_tank_upgrade','has_adr_training','return_to_kassel','return_to_start','adr_required','scope_regional','scope_national','scope_international','active'].forEach((key) => { if (!(key in data) && document.querySelector(`[name="${key}"]`)) data[key] = false; });
  return data;
}

async function deleteRecord(config, id) {
  const message = config.endpoint === 'vehicles' ? 'Fahrzeug wirklich löschen? Bestehende Auftragszuordnungen werden kontrolliert geprüft und aktive Zuordnungen aufgehoben.' : config.endpoint === 'orders' ? 'Auftrag wirklich löschen? Aktive Fahrzeugzuordnungen werden kontrolliert aufgehoben.' : 'Datensatz wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.';
  if (!confirm(message)) return;
  try { const result = await call(api.remove(config.endpoint, id)); toast(result.warning || 'Datensatz wurde gelöscht.', result.warning ? 'warning' : 'success'); showEntity(config); } catch (error) { toast(error.message, 'danger'); }
}

function showDataManagement() {
  setTitle('Datenverwaltung', 'Export, Import und manuelle Sicherheitskopien');
  document.getElementById('view').innerHTML = `<div class="row g-3"><div class="col-md-4"><div class="card h-100"><div class="card-body"><h2 class="h5">Datenbankexport</h2><p class="text-secondary">Vollständige SQLite-Datenbank als Datei speichern.</p><button class="btn btn-primary" id="exportDb">Exportieren</button></div></div></div><div class="col-md-4"><div class="card h-100"><div class="card-body"><h2 class="h5">Datenbankimport</h2><p class="text-secondary">SQLite-Datei prüfen, vorher Sicherung erstellen und aktive Datenbank ersetzen.</p><button class="btn btn-warning" id="importDb">Importieren</button></div></div></div><div class="col-md-4"><div class="card h-100"><div class="card-body"><h2 class="h5">Sicherheitskopie</h2><p class="text-secondary">Manuelle Kopie im Benutzerverzeichnis erstellen.</p><button class="btn btn-outline-light" id="backupDb">Backup erstellen</button></div></div></div></div>`;
  document.getElementById('exportDb').onclick = () => runDataAction(api.exportDatabase(), 'Export abgeschlossen.');
  document.getElementById('backupDb').onclick = () => runDataAction(api.backupDatabase(), 'Sicherheitskopie erstellt.');
  document.getElementById('importDb').onclick = async () => { if (confirm('Die aktive Datenbank wird nach erfolgreicher Prüfung ersetzt. Fortfahren?')) { const result = await runDataAction(api.importDatabase(), 'Import abgeschlossen. Anwendung wird neu gestartet.'); if (result?.restartRequired) await api.relaunch(); } };
}

async function showMap() {
  setTitle('Karte', 'Standorte und optional Fahrzeuge auf OpenStreetMap anzeigen');
  document.getElementById('view').innerHTML = `<div class="card"><div class="card-body"><div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="showVehicles"><label class="form-check-label" for="showVehicles">Fahrzeuge auf der Karte anzeigen</label></div><div id="mapView" class="map-view"></div></div></div>`;
  const render = async () => renderMap(document.getElementById('showVehicles').checked);
  document.getElementById('showVehicles').addEventListener('change', render);
  await render();
}

async function renderMap(includeVehicles) {
  const data = await call(api.mapData(includeVehicles));
  const mapElement = document.getElementById('mapView');
  if (currentMap) { currentMap.remove(); currentMap = null; }
  mapElement.innerHTML = '';
  const map = L.map(mapElement).setView([51.3127, 9.4797], 6);
  currentMap = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap-Mitwirkende' }).addTo(map);
  const bounds = [];
  data.locations.forEach((location) => {
    const latLng = [location.latitude, location.longitude]; bounds.push(latLng);
    L.marker(latLng).addTo(map).bindPopup(`<strong>${escapeHtml(location.name)}</strong><br>${escapeHtml(location.address)}`);
  });
  data.vehicles.forEach((vehicle) => {
    const latLng = [vehicle.latitude, vehicle.longitude]; bounds.push(latLng);
    L.circleMarker(latLng, { radius: 8, color: vehicle.available ? '#22c55e' : '#f59e0b', fillOpacity: 0.8 }).addTo(map).bindPopup(`<strong>${escapeHtml(vehicle.name)}</strong><br>${escapeHtml(vehicle.license_plate)}<br>${escapeHtml(vehicle.location_label)}<br>${vehicle.available ? 'verfügbar' : 'im Auftrag'}`);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
}

async function geocodeLocation(config, id) {
  try {
    await call(api.geocodeLocation(id));
    toast('Standort wurde ueber OpenStreetMap geocodiert.', 'success');
    showEntity(config);
  } catch (error) {
    toast(error.message, 'danger');
  }
}

async function runDataAction(promise, message) { try { const result = await call(promise); if (!result.canceled) toast(message, 'success'); return result; } catch (error) { toast(error.message, 'danger'); return null; } }
function setTitle(title, subtitle) { document.getElementById('pageTitle').textContent = title; document.getElementById('pageSubtitle').textContent = subtitle; }
function badge(text, color) { return `<span class="badge text-bg-${color}">${escapeHtml(text)}</span>`; }
function isTrailer(row) { return ['Auflieger', 'Lkw-Anhänger'].includes(row.vehicle_type); }
function playStartupWarningSound(warnings) {
  if (startupWarningSoundPlayed || !warnings.length) return;
  startupWarningSoundPlayed = true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.28);
  } catch (_error) {}
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function toast(message, type) { const id = `toast-${Date.now()}`; document.getElementById('toasts').insertAdjacentHTML('beforeend', `<div id="${id}" class="toast text-bg-${type} border-0" role="alert"><div class="d-flex"><div class="toast-body">${escapeHtml(message)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`); new bootstrap.Toast(document.getElementById(id)).show(); }

function vehicleFields(row) { return [text('name','Name',row.name,true), text('license_plate','Kennzeichen',row.license_plate,true), select('vehicle_type','Fahrzeugtyp', ['Lkw','Lkw-Anhänger','Sattelzugmaschine','Auflieger','Kleintransporter','Gigaliner'], row.vehicle_type, true), select('cargo_type','Frachttyp',['Pritsche','Tank','Vieh','Silo','Kühl','Tieflader','Universal'],row.cargo_type,true), num('capacity_fe','Kapazität in FE',row.capacity_fe), money('value','Wert in Euro',row.value_cents), num('tank_size_liters','Tankgröße in Litern',row.tank_size_liters), num('fuel_consumption_l_100km','Verbrauch l/100 km',row.fuel_consumption_l_100km), num('current_mileage','Aktueller Kilometerstand',row.current_mileage), num('maintenance_interval_km','Wartungsintervall km',row.maintenance_interval_km), num('last_maintenance_mileage','Letzte Wartung bei km',row.last_maintenance_mileage), calc('maintenance_preview','Nächste Wartung in Kilometern'), num('brake_status','Bremsenstatus %',row.brake_status), num('engine_status','Motorstatus %',row.engine_status), num('clutch_status','Kupplungsstatus %',row.clutch_status), num('tire_status','Reifenstatus %',row.tire_status), check('has_fax','Fax eingebaut',row.has_fax), check('has_tank_upgrade','Tankupgrade eingebaut',row.has_tank_upgrade), { type:'locationselect', name:'location_label', label:'Fahrzeugstandort', value: row.location_label || 'Hauptniederlassung Kassel', required: true, w: 6 } ]; }
function personnelFields(row) { return [text('personnel_number','Personalnummer',row.personnel_number,true), text('name','Name',row.name,true), date('hire_date','Einstellungsdatum',row.hire_date,true), money('salary','Gehalt',row.salary_cents), select('position','Position',['Lkw-Fahrer','Sekretärin','Buchhalter','Disponent','Kfz-Mechaniker','Lagerist','Personalsachbearbeiter','Reinigungskraft','Wachmann','Telefonistin','Bilanzbuchhalter','Rechtsanwalt'],row.position,true), check('has_adr_training','ADR-Schulung vorhanden',row.has_adr_training)]; }
function orderFields(row) { return [text('order_number','Auftragsnummer',row.order_number,true), select('order_type','Auftragsart',['Einzelvertrag','Teilabruf','Lagervertrag'],row.order_type,true), { type:'contractselect', name:'framework_contract_id', label:'Rahmenvertrag (für Teilabruf)', value: row.framework_contract_id || '', w: 6 }, text('customer','Kunde',row.customer,true), text('start_location','Startort (Start zum Abholort)',row.start_location,true), text('delivery_location','Lieferort',row.delivery_location,true), check('return_to_start','Rückkehr zum Startort',row.return_to_start), select('final_stop_mode','Abstellort nach Auftrag',['startort','niederlassung','zielort'],row.final_stop_mode || (row.return_to_kassel ? 'niederlassung' : 'zielort'),true), num('distance_km','Entfernung in km',row.distance_km), date('delivery_deadline','Lieferfrist',row.delivery_deadline), check('adr_required','ADR erforderlich',row.adr_required), date('delivery_date','Liefertermin',row.delivery_date), select('cargo_type','Frachttyp',['Pritsche','Tank','Vieh','Silo','Kühl','Tieflader','Universal'],row.cargo_type,true), num('cargo_amount_fe','Frachtmenge in FE',row.cargo_amount_fe), money('unit_price','Einzelpreis Euro/FE/km',row.unit_price_cents), calc('revenue_preview','Gesamtumsatz'), select('status','Auftragsstatus',['offen','in Arbeit','eingelagert','geliefert'],row.status || 'offen',true), { type:'multiselect', name:'vehicle_ids', label:'Fahrzeugauswahl' }]; }
function deliveryNoteFields(row) { return [{ type:'orderselect', name:'order_id', label:'Auftrag auswählen', value: row.order_id || '' }, text('order_number','Auftragsnummer',row.order_number,true), text('debtor','Debitor',row.debtor,true), text('goods','Ware',row.goods,true), num('cargo_amount_fe','Frachtmenge in FE',row.cargo_amount_fe), money('revenue','Umsatz',row.revenue_cents), select('status','Status',['Rechnung schreiben','warte auf Zahlungseingang','bezahlt','überfällig'],row.status,true)]; }
function invoiceFields(row) { return [text('invoice_number','Rechnungsnummer',row.invoice_number,true), text('creditor','Kreditor',row.creditor,true), text('item','Posten',row.item,true), money('amount','Betrag',row.amount_cents), date('invoice_date','Datum',row.invoice_date,true), date('due_date','Fälligkeit',row.due_date,true), select('payment_status','Zahlungsstatus',['offen','bezahlt','überfällig'],row.payment_status || 'offen',true)]; }
function investmentFields(row) { return [select('measure','Massnahme',['Flyer','Tageszeitung','Radiowerbung','Filmwerbung','Fernsehwerbung','große Werbekampagne'],row.measure,true), check('scope_regional','Regional',row.scope_regional), check('scope_national','National',row.scope_national), check('scope_international','International',row.scope_international), calc('investment_preview','Erfolgsquote und Kosten')]; }
function locationFields(row) { return [text('name','Standortname',row.name,true,4), text('address','Adresse oder Suchbegriff',row.address,true,5), { type:'geocodebutton', w: 3 }, hidden('latitude', row.latitude), hidden('longitude', row.longitude), hidden('geocoding_status', row.geocoding_status || 'unbekannt'), { type:'calculated', name:'coordinate_preview', label:'Koordinaten', value: row.latitude == null || row.longitude == null ? 'Noch nicht geocodiert' : `${fmt.number(row.latitude, 5)}, ${fmt.number(row.longitude, 5)}`, w: 6 }]; }
function frameworkContractFields(row) { return [text('contract_number','Rahmenvertragsnummer',row.contract_number,true), text('customer','Kunde',row.customer,true), text('start_location','Abholort',row.start_location,true), text('delivery_location','Lieferort',row.delivery_location,true), select('cargo_type','Frachttyp',['Pritsche','Tank','Vieh','Silo','Kühl','Tieflader','Universal'],row.cargo_type,true), money('unit_price','Einzelpreis Euro/FE/km',row.unit_price_cents,true), check('active','Aktiv',row.active ?? true), { type:'textarea', name:'notes', label:'Bemerkung', value: row.notes || '', w: 12 }]; }
function text(name,label,value,required,w,readonly){ return { type:'text', name, label, value, required, w, readonly }; }
function num(name,label,value,required,w){ return { type:'number', name, label, value: value ?? '', required, w, step: 'any' }; }
function money(name,label,cents,required,w){ return { type:'text', name, label, value: fmt.inputMoney(cents), required, w }; }
function date(name,label,value,required,w){ return { type:'date', name, label, value: value || '', required, w }; }
function select(name,label,options,value,required,w){ return { type:'select', name, label, options, value: value || options[0], required, w }; }
function check(name,label,value){ return { type:'checkbox', name, label, value: Boolean(value) }; }
function calc(name,label){ return { type:'calculated', name, label, value: '' }; }
function hidden(name,value){ return { type:'hidden', name, value: value ?? '' }; }
function setInput(name, value) { const input = document.querySelector(`[name="${name}"]`); if (input) input.value = value ?? ''; }
function inputNumber(value) { return Number(String(value || '0').replace(/\./g, '').replace(',', '.')) || 0; }
function inputMoneyCents(value) { return Math.round(inputNumber(value) * 100); }
