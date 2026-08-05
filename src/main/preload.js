const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('fleetDesk', {
  dashboard: () => invoke('dashboard:get'),
  list: (entity, options) => invoke('entity:list', { entity, options }),
  get: (entity, id) => invoke('entity:get', { entity, id }),
  create: (entity, data) => invoke('entity:create', { entity, data }),
  update: (entity, id, data) => invoke('entity:update', { entity, id, data }),
  remove: (entity, id) => invoke('entity:remove', { entity, id }),
  orderOptions: () => invoke('orders:options'),
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
