const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('fleetDesk', {
  dashboard: () => invoke('dashboard:get'),
  guvDetails: (monthKey) => invoke('guv:details', { monthKey }),
  getSettings: () => invoke('settings:get'),
  saveSettings: (settings) => invoke('settings:save', { settings }),
  list: (entity, options) => invoke('entity:list', { entity, options }),
  get: (entity, id) => invoke('entity:get', { entity, id }),
  create: (entity, data) => invoke('entity:create', { entity, data }),
  update: (entity, id, data) => invoke('entity:update', { entity, id, data }),
  remove: (entity, id) => invoke('entity:remove', { entity, id }),
  analyzeInvoiceImage: () => invoke('invoices:analyze-image'),
  selectInvoiceImage: () => invoke('invoices:select-image'),
  analyzeSelectedInvoiceImage: (sourcePath) => invoke('invoices:analyze-selected-image', { sourcePath }),
  createInvoiceFromImage: (data) => invoke('invoices:create-from-image', { data }),
  openInvoiceImage: (id) => invoke('invoices:open-image', { id }),
  invoiceImage: (id) => invoke('invoices:image', { id }),
  orderOptions: () => invoke('orders:options'),
  frameworkContractOptions: () => invoke('framework-contracts:options'),
  locationOptions: () => invoke('locations:options'),
  geocodeLocation: (id) => invoke('locations:geocode', { id }),
  geocodeAddress: (query) => invoke('locations:geocode-address', { query }),
  mapData: (includeVehicles) => invoke('map:data', { includeVehicles }),
  vehicleOptions: (order) => invoke('orders:vehicle-options', order),
  suggestVehicles: (order) => invoke('orders:suggest-vehicles', order),
  exportDatabase: () => invoke('data:export'),
  importDatabase: () => invoke('data:import'),
  backupDatabase: () => invoke('data:backup'),
  relaunch: () => invoke('app:relaunch')
});
