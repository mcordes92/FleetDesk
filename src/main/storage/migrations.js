const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        license_plate TEXT NOT NULL UNIQUE,
        vehicle_type TEXT NOT NULL,
        cargo_type TEXT NOT NULL,
        capacity_fe REAL,
        value_cents INTEGER NOT NULL DEFAULT 0 CHECK(value_cents >= 0),
        tank_size_liters REAL NOT NULL DEFAULT 0 CHECK(tank_size_liters >= 0),
        fuel_consumption_l_100km REAL NOT NULL DEFAULT 0 CHECK(fuel_consumption_l_100km >= 0),
        current_mileage INTEGER NOT NULL DEFAULT 0 CHECK(current_mileage >= 0),
        maintenance_interval_km INTEGER NOT NULL DEFAULT 0 CHECK(maintenance_interval_km >= 0),
        last_maintenance_mileage INTEGER NOT NULL DEFAULT 0 CHECK(last_maintenance_mileage >= 0),
        brake_status REAL CHECK(brake_status BETWEEN 0 AND 100),
        engine_status REAL CHECK(engine_status BETWEEN 0 AND 100),
        clutch_status REAL CHECK(clutch_status BETWEEN 0 AND 100),
        tire_status REAL CHECK(tire_status BETWEEN 0 AND 100),
        has_fax INTEGER NOT NULL DEFAULT 0 CHECK(has_fax IN (0,1)),
        has_tank_upgrade INTEGER NOT NULL DEFAULT 0 CHECK(has_tank_upgrade IN (0,1)),
        location_label TEXT NOT NULL DEFAULT 'Hauptniederlassung Kassel',
        latitude REAL,
        longitude REAL,
        available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE personnel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        personnel_number TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        hire_date TEXT NOT NULL,
        salary_cents INTEGER NOT NULL DEFAULT 0 CHECK(salary_cents >= 0),
        position TEXT NOT NULL,
        has_adr_training INTEGER NOT NULL DEFAULT 0 CHECK(has_adr_training IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT NOT NULL UNIQUE,
        order_type TEXT NOT NULL,
        customer TEXT NOT NULL,
        start_location TEXT NOT NULL,
        delivery_location TEXT NOT NULL,
        return_to_kassel INTEGER NOT NULL DEFAULT 0 CHECK(return_to_kassel IN (0,1)),
        distance_km REAL NOT NULL DEFAULT 0 CHECK(distance_km >= 0),
        delivery_deadline TEXT,
        adr_required INTEGER NOT NULL DEFAULT 0 CHECK(adr_required IN (0,1)),
        delivery_date TEXT,
        cargo_type TEXT NOT NULL,
        cargo_amount_fe REAL NOT NULL DEFAULT 0 CHECK(cargo_amount_fe >= 0),
        unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(unit_price_cents >= 0),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE order_vehicle_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        released_at TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX one_active_assignment_per_vehicle ON order_vehicle_assignments(vehicle_id) WHERE active = 1;

      CREATE TABLE delivery_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        order_number TEXT NOT NULL,
        debtor TEXT NOT NULL,
        goods TEXT NOT NULL,
        cargo_amount_fe REAL NOT NULL DEFAULT 0 CHECK(cargo_amount_fe >= 0),
        revenue_cents INTEGER NOT NULL DEFAULT 0 CHECK(revenue_cents >= 0),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        creditor TEXT NOT NULL,
        item TEXT NOT NULL,
        amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_cents >= 0),
        invoice_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE investments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        measure TEXT NOT NULL,
        scope_regional INTEGER NOT NULL DEFAULT 0 CHECK(scope_regional IN (0,1)),
        scope_national INTEGER NOT NULL DEFAULT 0 CHECK(scope_national IN (0,1)),
        scope_international INTEGER NOT NULL DEFAULT 0 CHECK(scope_international IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE geocoding_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL UNIQUE,
        latitude REAL,
        longitude REAL,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    version: 2,
    name: 'locations',
    sql: `
      CREATE TABLE locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        address TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        geocoding_status TEXT NOT NULL DEFAULT 'unbekannt',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO locations (name, address, latitude, longitude, geocoding_status)
      VALUES ('Hauptniederlassung Kassel', 'Kassel', 51.3127, 9.4797, 'ok');

      INSERT OR IGNORE INTO locations (name, address, latitude, longitude, geocoding_status)
      SELECT DISTINCT location_label, location_label, latitude, longitude,
        CASE WHEN latitude IS NULL OR longitude IS NULL THEN 'unbekannt' ELSE 'ok' END
      FROM vehicles
      WHERE location_label IS NOT NULL AND trim(location_label) != '';
    `
  },
  {
    version: 3,
    name: 'invoice_images',
    sql: `
      ALTER TABLE invoices ADD COLUMN image_path TEXT;
    `
  }
];

module.exports = { migrations };
