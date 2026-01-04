# Xplore Domäne Dahlem

Eine schlanke Leaflet-App mit mobilen und redaktionellen Helfern für POIs der Domäne Dahlem.

## Features
- Mobile Vollbild-Popup mit Zurück-Pfeil (Smartphones).
- Kategorien-Filter als Burger-Menü (mobil einklappbar).
- POIs aus CSV oder GeoJSON; CSV-Validator mit Bounds-Prüfung.
- Präzise Begrenzung per `data/bounds.geojson` (Point-in-Polygon).
- Robuste Koordinaten-Verarbeitung (Dezimal-Komma, Auto-Swap lat/lon).
- Marker nach Kategorie mit Symbolen (Historie, Landwirtschaft, Wildtiere/Pflanzen).
- Optionaler Tile-Provider per URL (`?provider=...&apikey=...`), Fallback OSM.

## Schnellstart
- Live-Demo: https://dddetlef.github.io/xplore-domaene-dahlem/
- Lokal starten (benötigt einen einfachen Webserver):
  - VS Code Erweiterung „Live Server“ oder
  - Python 3:
    ```powershell
    python -m http.server 8080
    ```
  - Node.js:
    ```powershell
    npx serve . -p 8080
    ```
- Edit-Modus: `index.html?edit=1` blendet Export/Import/Reload-Knöpfe ein.

## Daten (POIs)

### CSV → GeoJSON Konvertierung
- Zweck: CSV-POIs in eine GeoJSON-FeatureCollection umwandeln für Hosting/Versionierung.
- Skript: siehe `scripts/csv_to_geojson.ps1`.

#### Voraussetzungen
- Windows/PowerShell (oder `pwsh` plattformübergreifend).
- CSV mit Semikolon (`;`) als Trennzeichen.
- Für das Skript Koordinaten mit Dezimalpunkt (z. B. `52.457`). Die Web-App unterstützt zusätzlich Dezimal-Komma.

#### Standardausführung
- Im Projekt-Root wird `data/poi.geojson` aus `data/poi.csv` erzeugt:

```powershell
# Windows PowerShell
./scripts/csv_to_geojson.ps1

# Alternativ (PowerShell Core)
pwsh -File ./scripts/csv_to_geojson.ps1
```

Wenn Skriptausführung deaktiviert ist (PSSecurityException), temporär für die Sitzung erlauben:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Unblock-File -Path ./scripts/csv_to_geojson.ps1
./scripts/csv_to_geojson.ps1
```

Oder einmalig ohne Änderung der Sitzung:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/csv_to_geojson.ps1
```

#### Eigene Pfade
```powershell
./scripts/csv_to_geojson.ps1 -CsvPath ./data/meine_pois.csv -OutPath ./data/meine_pois.geojson
```

#### Unterstützte Spalten
- Koordinaten: `lat`/`latitude`/`y` und `lon`/`long`/`lng`/`x`/`longitude` (Auto-Swap bei vertauschten Werten).
- Eigenschaften: `title`/`name`, `desc`/`description`, `address`, `hours`/`opening_hours`, `website`/`link`/`url`, `category`/`subject`, `tags`, `photos`/`images` (Listen per `;` oder `,`).

#### Hinweise
- Nach der Konvertierung lädt die App weiterhin bevorzugt `data/poi.csv`. Für GeoJSON-Nutzung CSV umbenennen/entfernen, damit `data/poi.geojson` geladen wird.
- Bei Dezimal-Komma in Koordinaten vorab zu Dezimalpunkt konvertieren.
- Das Skript gibt die Anzahl der geschriebenen Features aus.

#### Schnell testen
```powershell
./scripts/csv_to_geojson.ps1
Get-Item ./data/poi.geojson
```

### CSV-Format
- Trennzeichen: Semikolon `;` (Excel-Standard in DE). Dezimal-Komma wird unterstützt.
- Pflicht: `latitude`/`lat`/`y`, `longitude`/`lon`/`lng`/`x` (Reihenfolge egal; vertauschte Werte werden auto-korrigiert).
- Optional (Popup-Inhalt):
  - `subject`: Themenbereich/Kategorie-Label
  - `title`/`name`: Titel
  - `text`/`desc`/`description`: Beschreibung
  - `funfact`: Fun Fact
  - `image`: Bild-URL (wird auch als `photos[0]` genutzt)
  - `link`/`url`/`website`: externer Link
  - `category`: Kategorie (für Filter & Markerfarbe/Icon)
- Absätze im Text: In Excel mit Alt+Enter Zeilenumbrüche setzen.
  - 1 Umbruch = Zeilenumbruch, 2 Umbrüche (Leerzeile) = neuer Absatz.

### Marker & Kategorien
- Farben: Historie = blau, Landwirtschaft = grün, Wildtiere/Pflanzen = dunkelgrün.
- Symbole: Universität (Historie), Blatt (Landwirtschaft), Pfote (Wildtiere/Pflanzen).
- Filter: Burger-Menü oben rechts; Vorauswahl per `?category=Historie,Landwirtschaft`.

## Grenzen (`bounds.geojson`)
- Beim Laden von `data/bounds.geojson` wird die Karte auf die Geometrie gezoomt.
- CSV-Validator prüft Punkte auf „innerhalb der Grenze“ (Polygon/Holes unterstützt).
- Edit-Modus (`?edit=1`):
  - Zeichnen/Bearbeiten (Leaflet Draw),
  - Export (⤓) speichert `bounds.geojson`,
  - Import (📥) lädt eine lokale GeoJSON/`bounds.geojson`.
  - POI-CSV Import (CSV) und POI-GeoJSON Export (⤓POI).
  - Reload-Button lädt CSV/GeoJSON neu mit Cache-Busting.

## URL-Parameter (optional)
- `provider=OpenTopoMap` oder `Thunderforest.Outdoors&apikey=DEIN_KEY`
- `csv=https://.../datei.csv`
- `category=Historie;Landwirtschaft`
- `minzoom=..&maxzoom=..`
- `bbox=minLon,minLat,maxLon,maxLat`
- `metrics=1` zeigt eine einfache Tile-Metrik-HUD.

## Hosting
- GitHub Pages: Repo → Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
- Statisches Hosting (z. B. WordPress Uploads) ist ebenfalls möglich.

## Hinweise
- OSM/Provider-Credits sichtbar lassen (Attribution).
- API-Keys nicht committen; per Server/ENV oder temporär in der URL.
- HTTPS empfohlen.
