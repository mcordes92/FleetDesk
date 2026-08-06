const { ipcMain } = require('electron');
const log = require('electron-log');
const service = require('../services/entityService');

function registerIpcHandlers(db) {
  const safe = (handler) => async (_event, payload) => {
    try {
      return { ok: true, data: await handler(payload || {}) };
    } catch (error) {
      log.error(error);
      return { ok: false, error: error.message || 'Ein technischer Fehler ist aufgetreten.' };
    }
  };

  ipcMain.handle('dashboard:get', safe(() => service.dashboard(db)));
  ipcMain.handle('settings:get', safe(() => service.getSettings(db)));
  ipcMain.handle('settings:save', safe(({ settings }) => service.saveSettings(db, settings)));
  ipcMain.handle('entity:list', safe(({ entity }) => service.list(db, entity)));
  ipcMain.handle('entity:get', safe(({ entity, id }) => service.get(db, entity, id)));
  ipcMain.handle('entity:create', safe(({ entity, data }) => service.create(db, entity, data)));
  ipcMain.handle('entity:update', safe(({ entity, id, data }) => service.update(db, entity, id, data)));
  ipcMain.handle('entity:remove', safe(({ entity, id }) => service.remove(db, entity, id)));
  ipcMain.handle('orders:vehicle-options', safe((order) => service.vehicleOptions(db, order)));
  ipcMain.handle('orders:suggest-vehicles', safe((order) => service.suggestions(db, order)));
  ipcMain.handle('orders:options', safe(() => service.orderOptions(db)));
  ipcMain.handle('locations:options', safe(() => service.locationOptions(db)));
  ipcMain.handle('locations:geocode', safe(({ id }) => service.geocodeLocation(db, id)));
  ipcMain.handle('locations:geocode-address', safe(({ query }) => service.geocodeAddress(db, query)));
  ipcMain.handle('map:data', safe(({ includeVehicles }) => service.mapData(db, includeVehicles)));
  ipcMain.handle('data:export', safe(() => service.exportDatabase(db)));
  ipcMain.handle('data:import', safe(() => service.importDatabase(db)));
  ipcMain.handle('data:backup', safe(() => service.backupDatabase(db)));
  ipcMain.handle('app:relaunch', safe(() => service.relaunchApp()));
}

module.exports = { registerIpcHandlers };
