# Xplore Domäne Dahlem

Eine schlanke, multilinguale Leaflet-App mit redaktionellen Helfern für POIs der Domäne Dahlem.
Hauptsächlich entwickelt für die Nutzung mit Smartphone ("mobile first").

[![GeoJSON Build](https://github.com/DDdetlef/xplore-domaene-dahlem/actions/workflows/geojson.yml/badge.svg)](https://github.com/DDdetlef/xplore-domaene-dahlem/actions/workflows/geojson.yml)

## Inhaltsverzeichnis
- [Features](#features)
- [Schnellstart](#schnellstart)
  - [Lokale Entwicklungstipps](#lokale-entwicklungstipps)
- [Daten (POIs)](#daten-pois)
  - [CSV → GeoJSON (CI)](#csv-geojson-ci)
    - [DE-Vollständigkeit und Bilder](#de-vollständigkeit-und-bilder)
    - [Voraussetzungen](#voraussetzungen)
    - [Ausführung](#ausführung)
    - [Monitoring](#monitoring)
    - [Workflow-Überblick](#workflow-%C3%9Cberblick)
    - [Unterstützte Spalten](#unterstützte-spalten)
  - [CSV-Format](#csv-format)
    - [Mehrsprachige Inhalte (DE/EN)](#mehrsprachige-inhalte-deen)
  - [Marker & Kategorien](#marker--kategorien)
- [Grenzen (bounds.geojson)](#grenzen-boundsgeojson)
- [URL-Parameter (optional)](#url-parameter-optional)
- [Performance & Robustheit (Mobil)](#performance--robustheit-mobil)
- [Netzwerk-Robustheit](#netzwerk-robustheit)
- [Verhalten Sprach-Umschalter](#verhalten-sprach-umschalter)
- [Hosting](#hosting)
- [Hinweise](#hinweise-1)
- [Troubleshooting](#troubleshooting)
- [First-Run Checklist](#first-run-checklist)
- [Drittanbieter / Abhängigkeiten](#drittanbieter--abh%C3%A4ngigkeiten)
- [Roadmap](#roadmap)

## Features
- Marker nach Kategorie mit Symbolen (Historie, Landwirtschaft, Wildtiere/Pflanzen).
- Kategorien-Filter als Burger-Menü (mobil einklappbar)
- Leaflet Popups mit strukturierten Daten (Thema, Titel, Text, Fun Fact, Foto, Link)
- Mobile Vollbild-Popups mit Zurück-Pfeil (Smartphones).
 - POIs aus GeoJSON (vorab aus CSV generiert).
- Präzise Begrenzung per `data/bounds.geojson` (Point-in-Polygon).
- Robuste Koordinaten-Verarbeitung (Dezimal-Komma, Auto-Swap lat/lon).
- Multilingual (DE/EN)
- Optionaler Tile-Provider per URL (`?provider=...&apikey=...`), Fallback OSM.
 - Verbindungssensitiv: Hinweis bei Datensparmodus/niedriger Verbindung.
 - Ressourcenschonend auf Low-End-Geräten (Canvas, reduzierte Animationen, geringerer Max-Zoom).
 - Stabileres Laden: Netzwerk-Timeouts, Retries und "Tap to retry"-Hinweis.
 - Marker-Clustering (reduziert visuelles Durcheinander und verbessert Performance bei vielen Punkten).

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

### Lokale Entwicklungstipps
- Ein einfacher Webserver ist nötig (wegen `fetch()` für CSV/GeoJSON). Siehe oben.
- Browser-Cache vermeiden: Entwicklungs-URL hat Cache-Busting; ansonsten `Ctrl+F5`.
- DevTools → Network → Throttling („Slow 3G“), um Save-Data/Niedrig-Verbindung zu simulieren.

## Daten (POIs)

### CSV → GeoJSON (CI)
- Zweck: CSV-POIs in eine GeoJSON-FeatureCollection umwandeln für Hosting/Versionierung.
  - CI-Workflow: siehe [.github/workflows/geojson.yml](.github/workflows/geojson.yml). Läuft automatisch bei Änderungen an [data/poi.csv](data/poi.csv) (Push/PR) und erzeugt/aktualisiert [data/poi.geojson](data/poi.geojson).

#### DE-Vollständigkeit und Bilder
- Das Skript mappt Inhalte DE-first: `title`, `text`, `subject`, `category` werden bevorzugt aus DE-Spalten übernommen und fallen auf EN zurück, wenn DE leer ist. Zusätzlich werden `*_en`-Felder gesetzt, sofern vorhanden.
- Bilder: Aus `photos`/`images` wird die erste URL als `image` übernommen, sodass Popups beim Erststart auch mit GeoJSON ein Inline-Bild anzeigen.
- Ergebnis: GeoJSON enthält vollständige DE-Inhalte und Bild-URL, wodurch gemischte Sprachen und fehlende Bilder beim Erstladen vermieden werden.

#### Voraussetzungen
- CSV mit Semikolon (`;`) als Trennzeichen, UTF‑8.
- Koordinaten mit Dezimalpunkt (z. B. `52.457`). Die Web-App unterstützt zusätzlich Dezimal-Komma.

#### Ausführung
- Keine lokale Vorab-Konvertierung nötig: Die GitHub Action führt die Konvertierung serverseitig aus und committet Änderungen an `data/poi.geojson` automatisch.

#### Unterstützte Spalten
- Koordinaten: `lat`/`latitude`/`y` und `lon`/`long`/`lng`/`x`/`longitude` (Auto-Swap bei vertauschten Werten).
- Eigenschaften: `title`/`name`, `desc`/`description`, `address`, `hours`/`opening_hours`, `website`/`link`/`url`, `category`/`subject`, `tags`, `photos`/`images` (Listen per `;` oder `,`).

#### Hinweise
- Frontend lädt ausschließlich `data/poi.geojson`. CSV wird nicht im Browser geparst.
- Bei Dezimal-Komma in Koordinaten vorab zu Dezimalpunkt konvertieren.
- Das Skript gibt die Anzahl der geschriebenen Features aus.

#### Monitoring
- Status im Actions-Tab oder Badge oben im README einsehbar.
- Der Workflow validiert, dass `poi.geojson` mindestens 1 Feature enthält.

#### Workflow-Überblick
- Trigger: Push/PR mit Änderungen an [data/poi.csv](data/poi.csv); manueller Start via Actions (workflow_dispatch).
- Branch: läuft nur auf `main`.
- Runner: `ubuntu-latest` mit PowerShell Core (`pwsh`).
- Schritte:
  - Checkout des Repos
  - Konvertierung: [scripts/csv_to_geojson.ps1](scripts/csv_to_geojson.ps1)
  - Validierung: Feature-Anzahl ≥ 1
  - Commit: aktualisiertes [data/poi.geojson](data/poi.geojson) bei Änderungen
- Berechtigungen: `contents: write` zum Committen durch den Workflow.
- Ergebnis: `poi.geojson` wird automatisch aktualisiert; Status/Logs sind in Actions/Checks sichtbar.

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

#### Mehrsprachige Inhalte (DE/EN)
- Sprachauswahl: über UI-Umschalter oben rechts oder `?lang=en`.
- Zusätzliche Spalten für Englisch werden unterstützt (Fallback auf Deutsch, falls leer):
  - `subject_en`: Themenbereich/Kategorie-Label (EN)
  - `title_en`/`name_en`: Titel (EN)
  - `text_en`/`desc_en`/`description_en`: Beschreibung (EN)
  - `funfact_en`: Fun Fact (EN)
- `image`/`photos` und `link` sind in der Regel sprachneutral; bei Bedarf können Sie `link_en` ergänzen und ich kann die App entsprechend erweitern.

### Marker & Kategorien
- Farben: Historie = blau, Landwirtschaft = orange, Wildtiere/Pflanzen = dunkelgrün.
- Symbole: Universität (Historie), Blatt (Landwirtschaft), Pfote (Wildtiere/Pflanzen).
- Filter: Burger-Menü oben rechts; Vorauswahl per `?category=Historie,Landwirtschaft`.
 - Clustering: Bei niedrigen Zoomstufen werden nahe Marker zu einem Cluster zusammengefasst. Beim Hineinzoomen teilen sich Cluster in einzelne Marker auf. Klick auf ein Cluster zoomt typischerweise in dessen Bereich; bei eng überlagerten Punkten werden diese „gespiderfied“ (radial aufgefächert), sodass jeder Punkt separat anklickbar ist.

## Grenzen (`bounds.geojson`)
- Beim Laden von `data/bounds.geojson` wird die Karte auf die Geometrie gezoomt.
- CSV-Validator prüft Punkte auf „innerhalb der Grenze“ (Polygon/Holes unterstützt).
- Edit-Modus (`?edit=1`):
  - Zeichnen/Bearbeiten (Leaflet Draw),
  - Export (⤓) speichert `bounds.geojson`,
  - Import (📥) lädt eine lokale GeoJSON/`bounds.geojson`.
  - POI-GeoJSON Export (⤓POI).
  - Reload-Button lädt CSV/GeoJSON neu mit Cache-Busting.

## URL-Parameter (optional)
- `provider=OpenTopoMap` oder `Thunderforest.Outdoors&apikey=DEIN_KEY`
- `category=Historie;Landwirtschaft`
- `minzoom=..&maxzoom=..`
- `bbox=minLon,minLat,maxLon,maxLat`
- `metrics=1` zeigt eine einfache Tile-Metrik-HUD.
- `lang=en` schaltet die UI auf Englisch (DE/EN Umschalter oben rechts).
 - `cluster=0` deaktiviert Marker-Clustering (Standard: aktiv); `cluster=1` erzwingt Aktivierung.
 - `zoomoutpadm=2000` setzt die Zoom‑Out‑Nachbarschaft in Metern (Standard derzeit testweise 2000 m).

## Performance & Robustheit (Mobil)
- Save-Data/Low-End-Erkennung: Nutzt `navigator.connection` (falls vorhanden), zeigt Hinweis und passt Verhalten an.
- Tile-Last reduzieren: `maxZoom` wird auf Low-End/Save-Data begrenzt (z. B. 17), um weniger und kleinere Tiles zu laden.
- Renderer/Animationen: Canvas-Renderer bevorzugt und Kartenanimationen reduziert auf Low-End.
- Bilder: Popup-Bilder mit `loading="lazy"` und `decoding="async"` für flüssigeres Scrollen.
- Layout-Stabilität: Debounced `resize`/`orientationchange` führt zu ruhigerem Re-Layout der Karte.
- Overscroll-Schutz: `overscroll-behavior` verhindert Hintergrund-Scrollen bei offenem mobilen Overlay.

## Netzwerk-Robustheit
- GeoJSON-Laden mit Retry, Timeout und Backoff.
- Bei Fehlern: Toast mit "Reload failed — tap to retry" (antippen, um erneut zu laden).

## Verhalten Sprach-Umschalter
- Beim Umschalten der Sprache werden Inhalte aktualisiert.
- Falls ein Popup offen war, wird es nach dem Umschalten erneut geöffnet (mit neuer Sprache).
- Wenn kein Popup offen war, bleibt es geschlossen (keine unerwartete Öffnung).

## Hosting
- GitHub Pages: Repo → Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
- Statisches Hosting (z. B. WordPress Uploads) ist ebenfalls möglich.

## Hinweise
- OSM/Provider-Credits sichtbar lassen (Attribution).
- API-Keys nicht committen; per Server/ENV oder temporär in der URL.
- HTTPS empfohlen.

## Troubleshooting

- **Bilder fehlen beim Erststart:** Stelle sicher, dass `image` oder `photos` in [data/poi.csv](data/poi.csv) gefüllt sind und prüfe die Action-Logs. Nach erfolgreichem Lauf enthält [data/poi.geojson](data/poi.geojson) die Bild-URL.
- **Nur GeoJSON:** CSV wird nicht im Frontend geladen; `poi.geojson` muss vorhanden sein (wird durch CI erzeugt).
- **Gemischte Sprache beim Erstladen:** DE-Felder (`subject`, `title`, `text`, `funfact`, `category`) in CSV befüllen; die Konvertierung setzt DE-first und fällt auf EN zurück, falls DE leer ist.

- **Cache-Probleme:**
  - Hartes Reload im Browser (Strg+F5), oder Entwicklungs-URL mit Cache-Busting nutzen.

- **Grenzen/Zoom:**
  - Falls die Karte zu weit herauszoomt, setze `minzoom`/`maxzoom` via URL.
  - Prüfe [data/bounds.geojson](data/bounds.geojson); nutze `?edit=1`, um Grenzen zu importieren/zu exportieren.

## First-Run Checklist

- Sprache testen:
  - DE: `index.html?lang=de`
  - EN: `index.html?lang=en`
- Popup-Inhalte beim Klick prüfen:
  - Bild sichtbar (Inline-`image` oder erstes `photos`-Bild)
  - Breadcrumb zeigt „Kategorie / Subject“ korrekt
  - Text in gewählter Sprache, Fun Fact und Link vorhanden
- Sprachumschalter-Verhalten:
  - Wenn kein Popup offen, bleibt es geschlossen beim Umschalten
  - Offenes Popup bleibt offen und aktualisiert Inhalte (DE/EN)
- Grenzen/Zoom:
  - Startansicht zeigt komplette Polygonfläche
  - Drag/Zoom bleibt innerhalb der Grenze (leichte Padding erlaubt)
- Netzwerk-Robustheit:
  - Bei Fehlern erscheint Toast und „Tap to retry“ funktioniert
  - Save-Data-Hinweis auf Low-End/gedrosselter Verbindung sichtbar

## Drittanbieter / Abhängigkeiten

- Leaflet (Kartenbibliothek)
  - CSS/JS via CDN: unpkg.com
  - https://leafletjs.com/
- Leaflet.AwesomeMarkers (Marker-Symbole)
  - CSS/JS via CDN: unpkg.com
  - https://github.com/lennardv2/Leaflet.awesome-markers
- Leaflet.Draw (Zeichen-/Editierwerkzeuge)
  - CSS/JS via CDN: cdnjs.com
  - https://github.com/Leaflet/Leaflet.draw
- Leaflet-Providers (Tile-Provider Katalog)
  - JS via CDN: unpkg.com
  - https://github.com/leaflet-extras/leaflet-providers
- Leaflet.MarkerCluster (Marker-Clustering)
  - CSS/JS via CDN: unpkg.com
  - https://github.com/Leaflet/Leaflet.markercluster
- Font Awesome 4.7 (Icons)
  - CSS via CDN: cdnjs.com
  - https://fontawesome.com/v4.7/
- Kartenkacheln (Default)
  - OpenStreetMap Standard: https://tile.openstreetmap.org (Attribution erforderlich)
  - Nutzungsbedingungen/Policies beachten.
- Kartenkacheln (optional via `provider=`)
  - Diverse Drittanbieter aus leaflet-providers; ggf. API-Key nötig; eigene Nutzungsbedingungen beachten.
- Externe Inhalte aus Daten
  - Bilder/Links aus CSV/GeoJSON (z. B. `www.domaene-dahlem.de`, `live.staticflickr.com`/`flickr.com`) werden direkt vom jeweiligen Host geladen.

## Roadmap

Für geplante Verbesserungen und priorisierte Empfehlungen siehe [ROADMAP.md](ROADMAP.md).
