const VEHICLE_TYPES = ['Lkw', 'Lkw-Anhänger', 'Sattelzugmaschine', 'Auflieger', 'Kleintransporter', 'Gigaliner'];
const CARGO_TYPES = ['Pritsche', 'Tank', 'Vieh', 'Silo', 'Kühl', 'Tieflader', 'Universal'];
const PERSONNEL_POSITIONS = ['Lkw-Fahrer', 'Sekretärin', 'Buchhalter', 'Disponent', 'Kfz-Mechaniker', 'Lagerist', 'Personalsachbearbeiter', 'Reinigungskraft', 'Wachmann', 'Telefonistin', 'Bilanzbuchhalter', 'Rechtsanwalt'];
const ORDER_TYPES = ['Einzelvertrag', 'Teilabruf', 'Lagervertrag'];
const ORDER_STATUSES = ['offen', 'in Arbeit', 'eingelagert', 'geliefert'];
const DELIVERY_NOTE_STATUSES = ['Rechnung schreiben', 'warte auf Zahlungseingang', 'bezahlt', 'überfällig'];
const INVOICE_STATUSES = ['offen', 'bezahlt', 'überfällig'];
const INVESTMENT_MEASURES = {
  Flyer: { successRate: 1, baseCostCents: 50000 },
  Tageszeitung: { successRate: 5, baseCostCents: 250000 },
  Radiowerbung: { successRate: 10, baseCostCents: 1000000 },
  Filmwerbung: { successRate: 25, baseCostCents: 5000000 },
  Fernsehwerbung: { successRate: 40, baseCostCents: 15000000 },
  'große Werbekampagne': { successRate: 100, baseCostCents: 50000000 }
};

function assertRequired(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${label} ist erforderlich.`);
}

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} ist ungueltig.`);
}

function assertNonNegative(value, label) {
  if (value === null || value === undefined || value === '') return;
  const number = parseLocaleNumber(value);
  if (number < 0 || Number.isNaN(number)) throw new Error(`${label} darf nicht negativ sein.`);
}

function assertPercent(value, label) {
  if (value === null || value === undefined || value === '') return;
  const number = parseLocaleNumber(value);
  if (Number.isNaN(number) || number < 0 || number > 100) throw new Error(`${label} muss zwischen 0 und 100 Prozent liegen.`);
}

function parseLocaleNumber(value) {
  if (typeof value !== 'string') return Number(value);
  const trimmed = value.trim();
  if (trimmed.includes(',')) return Number(trimmed.replace(/\./g, '').replace(',', '.'));
  const parts = trimmed.split('.');
  if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) return Number(trimmed.replace(/\./g, ''));
  return Number(trimmed);
}

function toBool(value) {
  return value ? 1 : 0;
}

function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = typeof value === 'string' ? value.replace(/\./g, '').replace(',', '.') : value;
  return Math.round(Number(normalized) * 100);
}

function calculateMaintenance(currentMileage, intervalKm, lastMaintenanceMileage) {
  const nextMaintenanceMileage = Number(lastMaintenanceMileage || 0) + Number(intervalKm || 0);
  const remainingKm = nextMaintenanceMileage - Number(currentMileage || 0);
  return { nextMaintenanceMileage, remainingKm, label: remainingKm < 0 ? `Überfällig seit ${Math.abs(remainingKm)} km` : `${remainingKm} km` };
}

function calculateRevenue(cargoAmountFe, distanceKm, unitPriceCents) {
  const cargo = parseLocaleNumber(cargoAmountFe || 0);
  const distance = parseLocaleNumber(distanceKm || 0);
  const unitPrice = parseLocaleNumber(unitPriceCents || 0);
  return Math.round(Number(cargo || 0) * Number(distance || 0) * Number(unitPrice || 0));
}

function calculateInvestment(measure, scopes) {
  const preset = INVESTMENT_MEASURES[measure];
  if (!preset) throw new Error('Massnahme ist ungueltig.');
  const count = ['regional', 'national', 'international'].filter((key) => scopes[key]).length;
  if (count < 1) throw new Error('Mindestens ein Werbeumfang muss ausgewaehlt sein.');
  return { successRate: preset.successRate, costCents: preset.baseCostCents * count };
}

function calculateProfitLoss(deliveryNotes, invoices) {
  const isPaid = (value) => String(value || '').trim().toLowerCase() === 'bezahlt';
  const incomeRows = deliveryNotes.filter((row) => isPaid(row.status));
  const expenseRows = invoices.filter((row) => isPaid(row.payment_status));
  const incomeCents = incomeRows.reduce((sum, row) => sum + Number(row.revenue_cents || 0), 0);
  const expenseCents = expenseRows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  return { incomeCents, expenseCents, resultCents: incomeCents - expenseCents, paidDeliveryNotes: incomeRows.length, paidInvoices: expenseRows.length };
}

function calculateUtilization(cargoAmountFe, capacityFe) {
  if (!capacityFe || Number(capacityFe) <= 0) return 0;
  return (Number(cargoAmountFe || 0) / Number(capacityFe)) * 100;
}

function haversineKm(a, b) {
  if (!a || !b || a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function suggestVehicleCombinations(order, vehicles, limit = 5) {
  const fitting = vehicles.filter((vehicle) => vehicle.available && (vehicle.cargo_type === order.cargo_type || vehicle.cargo_type === 'Universal'));
  const capacityVehicles = fitting.filter((vehicle) => Number(vehicle.capacity_fe || 0) > 0).sort((a, b) => Number(a.distance_km ?? 999999) - Number(b.distance_km ?? 999999));
  const candidates = [];
  const max = Math.min(capacityVehicles.length, 14);
  for (let mask = 1; mask < 1 << max; mask += 1) {
    const selected = [];
    for (let index = 0; index < max; index += 1) if (mask & (1 << index)) selected.push(capacityVehicles[index]);
    const capacity = selected.reduce((sum, vehicle) => sum + Number(vehicle.capacity_fe || 0), 0);
    const excess = capacity - Number(order.cargo_amount_fe || 0);
    const totalDistance = selected.reduce((sum, vehicle) => sum + Number(vehicle.distance_km ?? 999999), 0);
    candidates.push({ vehicles: selected, capacity, sufficient: excess >= 0, excess, totalDistance, utilization: calculateUtilization(order.cargo_amount_fe, capacity) });
  }
  return candidates.sort((a, b) => Number(b.sufficient) - Number(a.sufficient) || Math.max(a.excess, 0) - Math.max(b.excess, 0) || a.totalDistance - b.totalDistance || a.vehicles.length - b.vehicles.length).slice(0, limit);
}

module.exports = { VEHICLE_TYPES, CARGO_TYPES, PERSONNEL_POSITIONS, ORDER_TYPES, ORDER_STATUSES, DELIVERY_NOTE_STATUSES, INVOICE_STATUSES, INVESTMENT_MEASURES, assertRequired, assertOneOf, assertNonNegative, assertPercent, toBool, toCents, parseLocaleNumber, calculateMaintenance, calculateRevenue, calculateInvestment, calculateProfitLoss, calculateUtilization, haversineKm, suggestVehicleCombinations };
