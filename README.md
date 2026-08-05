# FleetDesk

FleetDesk ist eine lokale Electron-Desktopanwendung fuer Windows zur Verwaltung von Fuhrpark, Personal, Auftraegen, Buchhaltung, Investitionen und Datenimport/-export.

## Entwicklung

1. `npm install`
2. `npm start`

Die SQLite-Datenbank wird automatisch unter Electron `app.getPath("userData")` erstellt und migriert. Renderer-Code greift ausschliesslich ueber die Preload-API auf den Main-Prozess zu.

## Skripte

- `npm run dev`: Anwendung im Entwicklungsmodus starten.
- `npm start`: Anwendung starten.
- `npm run db:migrate`: lokale Datenbank initialisieren oder migrieren.
- `npm test`: zentrale Geschaeftslogik testen.
- `npm run build:win`: NSIS-Windows-Installer mit electron-builder erzeugen.

## Standorte und Karte

- Standorte werden in der Seite `Standorte` gepflegt.
- Die Koordinaten werden ueber die Geocoding-Schaltflaeche per OpenStreetMap/Nominatim ermittelt und lokal gecached.
- Die Seite `Karte` zeigt alle geocodierten Standorte auf OpenStreetMap. Fahrzeuge koennen optional eingeblendet werden.
- Fahrzeugstandorte werden in der Fahrzeugbearbeitung aus den gepflegten Standorten ausgewaehlt; Koordinaten werden dort nicht manuell angezeigt oder bearbeitet.

## Architektur

- `src/main`: Electron-Main-Prozess, IPC, SQLite, Services und Migrationen.
- `src/main/preload.js`: klar definierte, sichere Renderer-API.
- `src/renderer`: HTML, CSS und Vanilla-JavaScript mit Bootstrap 5 und Choices.js.
- `src/shared/business.js`: wiederverwendbare Berechnungen und Validierungsregeln.
- `test`: Node-Test-Suite fuer Kernlogik und Datenbankverhalten.
