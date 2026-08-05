Du bist ein erfahrener Senior-Softwareentwickler und Softwarearchitekt für Electron, JavaScript und SQLite.

Entwickle eine vollständige, lokal ausführbare Windows-Desktopanwendung mit dem Namen **FleetDesk**. Die Anwendung dient zur Verwaltung eines Transportunternehmens und umfasst die Bereiche Fuhrparkmanagement, Personalmanagement, Auftragsbuch, Buchhaltung und Investitionen.

## 1. Technischer Stack

Verwende ausschließlich:

* Electron
* JavaScript
* Kein TypeScript
* HTML5
* CSS3
* Bootstrap 5
* Bootstrap Icons
* SQLite
* `better-sqlite3`
* `electron-builder` für die Erstellung einer installierbaren Windows-Anwendung
* Vanilla JavaScript im Renderer, kein React, Vue oder Angular
* Choices.js oder eine vergleichbare lokal eingebundene JavaScript-Bibliothek für durchsuchbare Mehrfachauswahlfelder

Alle Abhängigkeiten müssen lokal installiert und gebündelt werden. Die Anwendung darf für ihre normale Funktion nicht von einem Webserver abhängig sein.

Erstelle eine saubere Projektstruktur mit mindestens:

* Electron-Main-Prozess
* Preload-Skript
* Renderer-Prozess
* Datenbankmodul
* Datenbankmigrationen
* Services für die einzelnen Geschäftsbereiche
* IPC-Handler
* Wiederverwendbare UI-Komponenten
* CSS-Dateien
* Hilfsfunktionen für Formatierung und Validierung

Nutze folgende Electron-Sicherheitskonfiguration:

* `contextIsolation: true`
* `nodeIntegration: false`
* Kommunikation zwischen Renderer und Main ausschließlich über eine klar definierte Preload-API
* Keine direkte SQLite-Verbindung aus dem Renderer
* Keine direkte Übergabe beliebiger SQL-Befehle über IPC
* Alle SQL-Befehle als vorbereitete Statements
* Transaktionen für zusammengehörige Datenbankänderungen

## 2. Allgemeine Anforderungen

Die gesamte Benutzeroberfläche muss deutschsprachig sein.

Die Anwendung benötigt eine feste Navigation zu folgenden Bereichen:

* Übersicht
* Fuhrpark
* Personal
* Auftragsbuch
* Buchhaltung
* Investitionen
* Datenverwaltung

Jeder Verwaltungsbereich soll Folgendes enthalten:

* Übersichts- beziehungsweise Tabellenansicht
* Suchfeld
* Filtermöglichkeiten
* Sortiermöglichkeiten
* Schaltfläche für einen neuen Datensatz
* Schaltfläche zum Bearbeiten vorhandener Datensätze
* Schaltfläche zum Löschen mit Sicherheitsabfrage
* Formularvalidierung
* Verständliche Fehlermeldungen
* Erfolgs- und Fehlermeldungen als Bootstrap-Toasts
* Leere-Zustände, wenn noch keine Daten vorhanden sind

Bestehende Funktionen und Felder dürfen bei späteren Änderungen nicht ohne ausdrückliche Anweisung entfernt werden.

## 3. Design

Das Design soll modern, professionell und übersichtlich sein.

Verwende Bootstrap 5 im Dark Mode mit:

```html
data-bs-theme="dark"
```

Hauptfarben:

* Midnight Blue als Primärfarbe, beispielsweise `#191970`
* Mittleres Grau als Sekundärfarbe
* Dunkler Hintergrund
* Gut lesbare helle Schrift
* Dezente Rahmen und Schatten
* Klare visuelle Abgrenzung der einzelnen Formulare und Bereiche

Weitere Designvorgaben:

* Responsive Benutzeroberfläche
* Für Desktopauflösungen optimiert
* Linke Sidebar oder übersichtliche obere Navigation
* Cards für Kennzahlen und Formulare
* Tabellen mit fixierten Tabellenköpfen
* Statusanzeigen als farbige Bootstrap-Badges
* Warnungen als Alert oder Warnsymbol
* Einheitliche Formularabstände
* Einheitliche Schaltflächen und Icons
* Modale Dialoge oder separate Ansichten für Bearbeitungsmasken
* Keine überladenen Animationen

## 4. Zahlen-, Datums- und Währungsformatierung

Verwende in der Benutzeroberfläche die deutsche Formatierung.

Beispiele:

* `1.000`
* `25.000`
* `1.250,50 €`
* `12,50 %`

Regeln:

* Tausenderstellen mit Punkt trennen
* Dezimalstellen mit Komma darstellen
* Geldbeträge immer mit zwei Nachkommastellen und Eurozeichen darstellen
* Prozentwerte immer mit zwei Nachkommastellen darstellen
* Datumswerte in der Oberfläche im Format `TT.MM.JJJJ`
* Datumswerte in SQLite intern als ISO-Datum `JJJJ-MM-TT`
* Geldbeträge intern als Ganzzahl in Cent speichern
* Prozentwerte und sonstige Dezimalwerte numerisch speichern
* Formatierte Strings niemals direkt als Berechnungsgrundlage verwenden

## 5. Fuhrparkmanagement

### 5.1 Fahrzeugübersicht

Zeige alle Fahrzeuge in einer Tabelle mit mindestens:

* Name
* Kennzeichen
* Fahrzeugtyp
* Frachttyp
* Kapazität
* aktueller Kilometerstand
* nächste Wartung
* Fahrzeugstandort
* Verfügbarkeit
* zugeordneter Auftrag
* Warnstatus
* Aktionen

Der Standort darf in der Fahrzeugübersicht angezeigt werden.

Der Standort darf jedoch nur in der Bearbeitungsmaske eines bestehenden Fahrzeugs manuell geändert werden.

Bei der Neuanlage eines Fahrzeugs soll als Standardstandort `Kassel` beziehungsweise `Hauptniederlassung Kassel` eingetragen werden. Das Standortfeld ist in der Neuanlage nicht manuell bearbeitbar.

### 5.2 Fahrzeugformular

Erstelle folgende Felder:

#### Fahrzeugdaten

* Name
* Kennzeichen
* Fahrzeugtyp als Dropdown:

  * Lkw
  * Lkw-Anhänger
  * Sattelzugmaschine
  * Auflieger
  * Kleintransporter
  * Gigaliner
* Frachttyp als Dropdown:

  * Pritsche
  * Tank
  * Vieh
  * Silo
  * Kühl
  * Tieflader
  * Universal
* Kapazität in FE
* Wert in Euro
* Tankgröße in Litern
* Verbrauch in Litern pro 100 Kilometer

Regeln:

* Bei Fahrzeugtyp `Sattelzugmaschine` das Feld Kapazität deaktivieren, leeren und als `NULL` speichern.
* Kennzeichen müssen eindeutig sein.
* Negative Werte sind unzulässig.
* Pflichtfelder deutlich kennzeichnen.

#### Wartungsdaten

* aktueller Kilometerstand
* Wartungsintervall in Kilometern
* letzte Wartung bei Kilometerstand
* nächste Wartung in Kilometern
* Bremsenstatus in Prozent
* Motorstatus in Prozent
* Kupplungsstatus in Prozent
* Reifenstatus in Prozent
* Fax eingebaut als Checkbox
* Tankupgrade eingebaut als Checkbox

Berechnung der Wartung:

```text
Nächste Wartung bei Kilometerstand =
letzte Wartung bei Kilometerstand + Wartungsintervall

Verbleibende Kilometer =
Nächste Wartung bei Kilometerstand - aktueller Kilometerstand
```

Das Feld `Nächste Wartung in Kilometern` ist automatisch zu berechnen und schreibgeschützt.

Ist der berechnete Wert negativ, zeige statt eines negativen Standardwertes deutlich:

```text
Überfällig seit X km
```

Regeln für Statuswerte:

* Erlaubter Bereich von 0 bis 100 Prozent
* Anzeige immer mit zwei Nachkommastellen
* Motorstatus bei `Auflieger` und `Lkw-Anhänger` deaktivieren, leeren und als `NULL` speichern
* Kupplungsstatus bei `Auflieger` und `Lkw-Anhänger` deaktivieren, leeren und als `NULL` speichern

Wenn kein Fax eingebaut ist:

* Warnung direkt im Formular anzeigen
* Warnsymbol oder Warn-Badge in der Fahrzeugübersicht anzeigen
* Speichern trotzdem erlauben

### 5.3 Fahrzeugbearbeitung

Über eine Schaltfläche soll eine Bearbeitungsmaske für Bestandsfahrzeuge geöffnet werden.

In dieser Maske sind alle Fahrzeug- und Wartungsdaten bearbeitbar.

Zusätzlich ist nur hier das Feld `Fahrzeugstandort` manuell bearbeitbar.

Für den Standort sollen gespeichert werden können:

* Standortbezeichnung oder Adresse
* Breitengrad
* Längengrad

Breitengrad und Längengrad können automatisch durch einen austauschbaren Geocoding-Service ermittelt werden. Geocoding-Ergebnisse müssen lokal in SQLite zwischengespeichert werden.

Falls keine Koordinaten ermittelt werden können, muss die Anwendung dies anzeigen und darf keine erfundene Entfernung darstellen.

## 6. Personalmanagement

### 6.1 Personalübersicht

Zeige vorhandenes Personal in einer Tabelle mit:

* Personalnummer
* Name
* Einstellungsdatum
* Gehalt
* Position
* ADR-Schulung
* Aktionen

### 6.2 Personalformular

Felder:

* Personalnummer
* Name
* Einstellungsdatum
* Gehalt
* Position als Dropdown:

  * Lkw-Fahrer
  * Sekretärin
  * Buchhalter
  * Disponent
  * Kfz-Mechaniker
  * Lagerist
  * Personalsachbearbeiter
  * Reinigungskraft
  * Wachmann
  * Telefonistin
  * Bilanzbuchhalter
  * Rechtsanwalt
* ADR-Schulung vorhanden als Checkbox

Regeln:

* Personalnummer muss eindeutig sein.
* Gehalt darf nicht negativ sein.
* Die ADR-Checkbox ist nur bei der Position `Lkw-Fahrer` aktiv.
* Bei allen anderen Positionen ist die ADR-Checkbox deaktiviert, nicht ausgewählt und wird als `false` gespeichert.

Über eine Schaltfläche muss eine Bearbeitungsmaske für vorhandenes Personal geöffnet werden können.

## 7. Auftragsbuch

### 7.1 Auftragsübersicht

Zeige vorhandene Aufträge in einer Tabelle mit:

* Auftragsnummer
* Auftragsart
* Kunde
* Startort
* Lieferort
* Entfernung
* Lieferfrist
* Frachttyp
* Frachtmenge
* Gesamtumsatz
* Auftragsstatus
* zugeordnete Fahrzeuge
* Auslastung
* Aktionen

### 7.2 Auftragsformular

Felder:

* Auftragsnummer
* Auftragsart als Dropdown:

  * Einzelvertrag
  * Teilabruf
  * Lagervertrag
* Kunde
* Startort
* Lieferort
* Checkbox `Rückfahrt zur Hauptniederlassung Kassel`
* Entfernung in Kilometern
* Lieferfrist
* ADR erforderlich als Checkbox
* Liefertermin
* Frachttyp als Dropdown:

  * Pritsche
  * Tank
  * Vieh
  * Silo
  * Kühl
  * Tieflader
  * Universal
* Frachtmenge in FE
* Einzelpreis in Euro pro FE und Kilometer
* Gesamtumsatz
* Auftragsstatus als Dropdown:

  * offen
  * in Arbeit
  * eingelagert
  * geliefert
* Fahrzeugauswahl als durchsuchbares Mehrfachauswahlfeld

Regeln:

* Auftragsnummer muss eindeutig sein.
* Liefertermin ist nur bei Auftragsart `Lagervertrag` aktiv.
* Bei anderen Auftragsarten wird das Feld deaktiviert und als `NULL` gespeichert.
* Ist die Checkbox für die Rückfahrt nach Kassel aktiviert, ist der spätere Fahrzeugstandort `Hauptniederlassung Kassel`.
* Ist sie nicht aktiviert, kehren die Fahrzeuge zum Startort zurück.
* Gesamtumsatz ist automatisch zu berechnen und schreibgeschützt.

Berechnung:

```text
Gesamtumsatz =
Frachtmenge in FE × Entfernung in KM × Einzelpreis pro FE und KM
```

Der Einzelpreis ist bereits als Preis pro FE und Kilometer definiert. Eine mögliche Rückfahrt darf daher nicht erneut in die Umsatzberechnung aufgenommen werden.

### 7.3 Fahrzeugzuordnung

Die Fahrzeugauswahl muss:

* Durchsuchbar sein
* Mehrere Fahrzeuge erlauben
* Fahrzeugname anzeigen
* Kennzeichen anzeigen
* Fahrzeugtyp anzeigen
* Frachttyp anzeigen
* Kapazität anzeigen
* Standort anzeigen
* Entfernung zum Startort anzeigen, sofern berechenbar
* Verfügbarkeit anzeigen
* Auslastung anzeigen

Fahrzeuge dürfen nicht vorgeschlagen oder auswählbar sein, wenn sie bereits einem nicht gelieferten Auftrag zugeordnet sind.

Die Zuordnung wird automatisch aufgehoben, sobald der Auftragsstatus auf `geliefert` geändert wird.

Diese Statusänderung muss innerhalb einer SQLite-Transaktion Folgendes ausführen:

1. Auftrag auf `geliefert` setzen
2. Alle aktiven Fahrzeugzuordnungen dieses Auftrags beenden
3. Fahrzeugstandorte aktualisieren
4. Fahrzeuge wieder als verfügbar markieren

Der neue Fahrzeugstandort lautet:

* `Hauptniederlassung Kassel`, wenn die entsprechende Checkbox aktiviert ist
* ansonsten der Startort des Auftrags

Wird ein bereits gelieferter Auftrag wieder auf einen anderen Status geändert, dürfen die früheren Fahrzeugzuordnungen nicht automatisch wiederhergestellt werden.

### 7.4 Intelligente Fahrzeugvorschläge

Entwickle eine Vorschlagslogik, die passende verfügbare Fahrzeuge beziehungsweise Fahrzeugkombinationen ermittelt.

Berücksichtige:

* Fahrzeug ist aktuell keinem aktiven Auftrag zugeordnet
* Frachttyp stimmt mit dem Auftrag überein
* Fahrzeuge mit Frachttyp `Universal` gelten für alle Frachttypen als geeignet
* Kapazität ist vorhanden und größer als null
* Gesamtmenge der ausgewählten Fahrzeuge deckt die Frachtmenge
* Nähe zum Startort
* Möglichst hohe Auslastung
* Möglichst geringe überschüssige Kapazität
* Möglichst geringe Gesamtentfernung zum Startort

Die Auslastung wird so berechnet:

```text
Auslastung in Prozent =
Frachtmenge ÷ Gesamtkapazität der ausgewählten Fahrzeuge × 100
```

Ist die Gesamtkapazität kleiner als die Frachtmenge, muss die Auswahl deutlich als unzureichend markiert werden.

Ziel ist eine Auslastung von möglichst genau 100 Prozent.

Zeige bis zu fünf sinnvolle Fahrzeugkombinationen an. Nutze dafür eine nachvollziehbare Heuristik oder eine begrenzte Kombinationensuche, damit die Oberfläche auch bei vielen Fahrzeugen schnell bleibt.

Priorisierung:

1. Ausreichende Kapazität
2. Geringste überschüssige Kapazität
3. Kürzeste Entfernung zum Startort
4. Wenigste benötigte Fahrzeuge

Sattelzugmaschinen ohne eigene FE-Kapazität dürfen manuell zugeordnet werden, zählen aber nicht zur berechneten Frachtkapazität.

Für die Standortnähe:

* Startort und Fahrzeugstandort möglichst in Koordinaten umwandeln
* Koordinaten in SQLite speichern
* Entfernung über die Haversine-Formel berechnen
* Entfernung als Luftlinie kennzeichnen
* Geocoding hinter einer austauschbaren Service-Schnittstelle kapseln
* Ergebnisse lokal cachen
* Bei fehlenden Koordinaten keine Entfernung vortäuschen
* Bei nicht verfügbarer Entfernung zunächst exakte Übereinstimmungen von Ort oder Stadt bevorzugen

Die intelligenten Vorschläge sind Empfehlungen. Die manuelle Fahrzeugauswahl muss weiterhin möglich sein.

## 8. Buchhaltung

Die Buchhaltung besteht aus:

* Lieferscheinen
* Eingangsrechnungen
* Gewinn- und Verlustrechnung

### 8.1 Lieferscheine

Felder:

* Auftragsnummer
* Debitor
* Ware
* Frachtmenge in FE
* Umsatz
* Status als Dropdown:

  * Rechnung schreiben
  * warte auf Zahlungseingang
  * bezahlt
  * überfällig

Die Auftragsnummer soll nach Möglichkeit aus den vorhandenen Aufträgen ausgewählt werden können.

Bei Auswahl eines vorhandenen Auftrags können passende Daten wie Kunde, Frachtmenge und Umsatz automatisch übernommen werden. Die Werte müssen anschließend kontrollierbar und je nach sinnvoller Geschäftslogik bearbeitbar sein.

### 8.2 Eingangsrechnungen

Felder:

* Rechnungsnummer
* Kreditor
* Posten
* Betrag
* Datum
* Fälligkeit
* Zahlungsstatus als Dropdown:

  * offen
  * bezahlt
  * überfällig

Der Zahlungsstatus ist erforderlich, da nur bezahlte Rechnungen in der Gewinn- und Verlustrechnung als Aufwand berücksichtigt werden dürfen.

Rechnungsnummern müssen eindeutig sein.

Der Status `überfällig` soll automatisch vorgeschlagen oder gesetzt werden können, wenn:

* das Fälligkeitsdatum überschritten ist
* und der Zahlungsstatus nicht `bezahlt` ist

### 8.3 Gewinn- und Verlustrechnung

Erstelle eine automatisch berechnete Gewinn- und Verlustübersicht.

Berechnung:

```text
Einnahmen =
Summe der Umsätze aller Lieferscheine mit Status "bezahlt"

Aufwendungen =
Summe der Beträge aller Eingangsrechnungen mit Zahlungsstatus "bezahlt"

Gewinn oder Verlust =
Einnahmen - Aufwendungen
```

Zeige mindestens:

* Einnahmen
* Aufwendungen
* Gewinn oder Verlust
* Anzahl bezahlter Lieferscheine
* Anzahl bezahlter Rechnungen
* optional filterbaren Zeitraum

Die Werte dürfen nicht redundant als manuell gepflegte Summen gespeichert werden, sondern müssen aus den zugrunde liegenden Datensätzen berechnet werden.

Erstelle Schaltflächen und Bearbeitungsmasken für vorhandene Lieferscheine und Rechnungen.

## 9. Investitionen

### 9.1 Investitionsformular

Felder:

* Maßnahme als Dropdown:

  * Flyer
  * Tageszeitung
  * Radiowerbung
  * Filmwerbung
  * Fernsehwerbung
  * große Werbekampagne
* Werbeumfang als drei unabhängige Checkboxen:

  * Regional
  * National
  * International
* Erfolgsquote
* Kosten

Mindestens ein Werbeumfang muss ausgewählt sein.

Die Erfolgsquote wird anhand der Maßnahme automatisch zugewiesen:

| Maßnahme            | Erfolgsquote |
| ------------------- | -----------: |
| Flyer               |       1,00 % |
| Tageszeitung        |       5,00 % |
| Radiowerbung        |      10,00 % |
| Filmwerbung         |      25,00 % |
| Fernsehwerbung      |      40,00 % |
| große Werbekampagne |     100,00 % |

Die Grundkosten werden anhand der Maßnahme automatisch zugewiesen:

| Maßnahme            |  Grundkosten |
| ------------------- | -----------: |
| Flyer               |     500,00 € |
| Tageszeitung        |   2.500,00 € |
| Radiowerbung        |  10.000,00 € |
| Filmwerbung         |  50.000,00 € |
| Fernsehwerbung      | 150.000,00 € |
| große Werbekampagne | 500.000,00 € |

Da bei mehreren ausgewählten Werbeumfängen die Kosten addiert werden sollen, gilt:

```text
Gesamtkosten =
Grundkosten der Maßnahme × Anzahl ausgewählter Werbeumfänge
```

Beispiele:

```text
Flyer + Regional = 500,00 €
Flyer + Regional + National = 1.000,00 €
Flyer + Regional + National + International = 1.500,00 €
```

Die Erfolgsquote bleibt unabhängig von der Anzahl der Werbeumfänge der festgelegte Wert der Maßnahme.

Erfolgsquote und Kosten sind automatisch zu berechnen und schreibgeschützt.

Erstelle außerdem eine Investitionsübersicht mit Bearbeitungs- und Löschfunktion.

## 10. SQLite-Datenmodell

Erstelle normalisierte Tabellen, mindestens für:

* `vehicles`
* `personnel`
* `orders`
* `order_vehicle_assignments`
* `delivery_notes`
* `invoices`
* `investments`
* `geocoding_cache`
* `app_settings`
* `schema_migrations`

Alle Tabellen benötigen:

* Primärschlüssel
* sinnvolle Datentypen
* Fremdschlüssel
* notwendige Unique-Constraints
* `created_at`
* `updated_at`

Nutze Fremdschlüssel mit aktivierter SQLite-Fremdschlüsselprüfung.

Die Tabelle für Fahrzeugzuordnungen soll mindestens enthalten:

* Auftrag
* Fahrzeug
* Zeitpunkt der Zuordnung
* Zeitpunkt der Freigabe
* aktiver Status

Es darf pro Fahrzeug höchstens eine aktive Zuordnung gleichzeitig existieren.

Nutze dafür geeignete Prüfungen in der Geschäftslogik und, soweit sinnvoll, einen partiellen Unique-Index.

Abgeleitete Werte wie:

* nächste Wartung
* verbleibende Kilometer
* Gesamtumsatz
* GuV-Summen
* Auslastung

sollen grundsätzlich berechnet und nicht unnötig redundant gespeichert werden.

## 11. Datenimport und Datenexport

Erstelle im Bereich `Datenverwaltung` Funktionen für:

### Datenbankexport

* Vollständige SQLite-Datenbank als `.sqlite`- oder `.db`-Datei exportieren
* Speicherort über nativen Windows-Dateidialog auswählen
* Vor dem Export ausstehende Transaktionen abschließen
* Erfolg oder Fehler anzeigen

### Datenbankimport

* SQLite-Datei über nativen Windows-Dateidialog auswählen
* Datei vor dem Import validieren
* Vorhandensein der benötigten Tabellen prüfen
* Datenbankversion beziehungsweise Migrationsstand prüfen
* Vor dem Ersetzen der aktiven Datenbank automatisch eine Sicherheitskopie erstellen
* Deutliche Sicherheitsabfrage anzeigen
* Import nur nach Bestätigung durchführen
* Bei fehlerhaftem Import automatisch zur vorherigen Datenbank zurückkehren
* Nach erfolgreichem Import die Ansichten aktualisieren oder die Anwendung kontrolliert neu laden

Zusätzlich soll eine Schaltfläche für eine manuelle Sicherheitskopie vorhanden sein.

Datenbankdateien dürfen niemals kommentarlos überschrieben werden.

## 12. Übersicht beziehungsweise Dashboard

Erstelle eine Startübersicht mit Kennzahlen wie:

* Anzahl Fahrzeuge
* verfügbare Fahrzeuge
* Fahrzeuge im Auftrag
* Fahrzeuge mit überfälliger Wartung
* Fahrzeuge ohne Fax
* Anzahl Mitarbeiter
* offene Aufträge
* Aufträge in Arbeit
* eingelagerte Aufträge
* bezahlte Einnahmen
* bezahlte Aufwendungen
* aktueller Gewinn oder Verlust
* gesamte Investitionskosten

Zeige wichtige Warnungen in einer separaten Liste:

* überfällige Wartungen
* Fahrzeuge ohne Fax
* überfällige Lieferscheine
* überfällige Eingangsrechnungen
* Aufträge ohne ausreichende Fahrzeugkapazität

## 13. Validierung und Fehlerbehandlung

Implementiere sowohl Validierung im Renderer als auch verbindliche Validierung im Main-Prozess beziehungsweise Datenbank-Service.

Prüfe unter anderem:

* Pflichtfelder
* eindeutige Kennzeichen
* eindeutige Personalnummern
* eindeutige Auftragsnummern
* eindeutige Rechnungsnummern
* gültige Datumswerte
* nicht negative Geldbeträge
* nicht negative Kilometerwerte
* Prozentwerte zwischen 0 und 100
* gültige Dropdownwerte
* ausreichende Fahrzeugkapazität
* keine doppelte aktive Fahrzeugzuordnung
* keine beschädigte Importdatenbank

Fehlermeldungen müssen verständlich sein und dürfen keine internen Stacktraces in der Benutzeroberfläche anzeigen.

Technische Fehler sollen lokal protokolliert werden.

## 14. Bedienung und Datenverlustschutz

* Bei ungespeicherten Formularänderungen vor dem Schließen oder Wechseln warnen.
* Vor Löschvorgängen eine Bestätigung verlangen.
* Vor dem Löschen eines Fahrzeugs mit bestehenden Auftragszuordnungen warnen.
* Vor dem Löschen eines Auftrags bestehende Zuordnungen kontrolliert aufheben.
* Kritische zusammengehörige Aktionen in Transaktionen ausführen.
* Beim Programmstart die Datenbank und Migrationen prüfen.
* Bei einem Datenbankfehler eine verständliche Fehleransicht anzeigen.
* Keine Daten stillschweigend verwerfen.

## 15. Windows-Build

Konfiguriere `electron-builder` für Windows.

Benötigt werden:

* Installierbare Windows-EXE
* NSIS-Installer
* Anwendungsname `FleetDesk`
* Sinnvolle Versionsnummer
* Desktopverknüpfung als Installationsoption
* Startmenüeintrag
* Deinstallation
* SQLite-Datenbank im beschreibbaren Benutzerverzeichnis
* Datenbank niemals innerhalb des schreibgeschützten Installationsordners speichern

Nutze hierfür einen geeigneten Pfad unter Electron `app.getPath("userData")`.

Erstelle mindestens folgende npm-Skripte:

* Entwicklung starten
* Anwendung starten
* Windows-Build erstellen
* Datenbank initialisieren oder migrieren
* Tests ausführen

## 16. Tests

Erstelle Tests für zentrale Geschäftslogik, mindestens für:

* Wartungsberechnung
* Umsatzberechnung
* Investitionskosten
* Investitionserfolgsquote
* GuV-Berechnung
* Fahrzeugverfügbarkeit
* Freigabe der Fahrzeuge beim Status `geliefert`
* Aktualisierung des Fahrzeugstandorts
* Auslastungsberechnung
* Fahrzeugkombinationsvorschläge
* bedingtes Deaktivieren von Formularfeldern
* Datenbankimportvalidierung

## 17. Erwartetes Ergebnis

Liefere ein vollständiges, funktionsfähiges Projekt.

Die Ausgabe muss enthalten:

1. Vollständige Projektstruktur
2. Vollständige Inhalte aller Dateien
3. `package.json`
4. Electron-Main-Datei
5. Preload-Datei
6. Datenbankmodul
7. SQL-Migrationen
8. IPC-Handler
9. HTML-Dateien
10. JavaScript-Dateien
11. CSS-Dateien
12. Bootstrap-Integrations
13. Choices.js-Integration
14. CRUD-Funktionen für alle Module
15. Import- und Exportfunktion
16. Tests
17. Installationsanleitung
18. Entwicklungsanleitung
19. Build-Anleitung für Windows
20. Kurze Beschreibung der Architektur

Nutze keine Platzhalter wie:

* `TODO`
* `Hier Code ergänzen`
* `Implementierung folgt`
* unvollständige Beispielmethoden
* ausgelassene Dateien

Der Code muss direkt nach folgenden Befehlen ausführbar sein:

```bash
npm install
npm start
```

Der Windows-Build muss über ein dokumentiertes npm-Skript erzeugt werden können.

Arbeite schrittweise, aber liefere am Ende sämtliche benötigten Dateien vollständig. Verwende ausschließlich JavaScript und kein TypeScript.
