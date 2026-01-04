# xplore Domäne Dahlem

Eine schlanke Leaflet-App mit:
- Tile-Provider-Umschalter per URL (`?provider=...&apikey=...`) – mit Fallback auf OSM.
- Begrenzung des Kartengebiets (BBox) und Min/Max-Zoom (`?bbox=minLon,minLat,maxLon,maxLat&minzoom=..&maxzoom=..`).
- Einfacher Tile-Metrik-Anzeige (`?metrics=1`) zur Abschätzung der Sitzungs-Last.
- Optionalem GeoJSON unter `data/poi.geojson`.

## Schnellstart
- Öffne `index.html` lokal oder auf einem Webserver.
- Beispiele:
  - OSM Standard: `index.html`
  - OpenTopoMap: `index.html?provider=OpenTopoMap`
  - Thunderforest (API-Key): `index.html?provider=Thunderforest.Outdoors&apikey=DEIN_KEY`
  - BBox & Zoom: `index.html?bbox=13.27,52.44,13.31,52.47&minzoom=13&maxzoom=18`
  - Metrik: `index.html?metrics=1`
  ## Map View & Metriken
  - HUD (bei `?metrics=1`) zeigt: geladene Tiles, eindeutige Tiles (Session), sichtbare Tiles (Viewport), Zoom.
  - Ein Map View entspricht: 15 Raster-Tiles (256px) oder 4 Raster-512 Tiles.
  - Die HUD schätzt die aktuellen Map Views im Viewport basierend auf der erkannten Tilegröße.
  - Hinweis: Bei Retinageräten und verschiedenen Providern kann die reale Abrechnung abweichen.
  - Dev-Overlay (BBox-Rahmen): `index.html?showbbox=1` (oder `&dev=1`)

## BBox Domäne Dahlem
- Standardmäßig wird die Karte auf die Domäne Dahlem gezoomt und auf deren BBox begrenzt.
- Offizielle BBox (OSM/Nominatim, Reihenfolge `minLon,minLat,maxLon,maxLat`):
  - `13.2877241,52.4581727,13.2898741,52.4601029`
- Beispiel-URL, die diese BBox explizit setzt:
  - `index.html?bbox=13.2877241,52.4581727,13.2898741,52.4601029&minzoom=15&maxzoom=19`

## Polygon (Grenze) bearbeiten
  - Polygone/Rechtecke zeichnen und bestehende Formen bearbeiten.
  - Export: Button oben rechts (⤓) speichert die aktuelle Grenze als `bounds.geojson`.
  - Import: Button oben rechts (📥) lädt eine lokale `bounds.geojson`/GeoJSON-Datei in die Karte.

### Auto-Zoom
- Beim Laden von `data/bounds.geojson` zoomt die Karte automatisch auf die enthaltene Geometrie.

## Daten (POIs)
- Lege deine Punkte in `data/poi.geojson` ab (GeoJSON FeatureCollection, Punkte als `[lon, lat]`).
- Alternativ kannst du per CSV→GeoJSON konvertieren und die Datei hier ablegen.

### POI-Properties (Popup-Inhalt)
- `title` oder `name`: Überschrift des POIs
- `desc` oder `description`: kurzer Beschreibungstext
- `address`: Adresse
- `hours` oder `opening_hours`: Öffnungszeiten
- `website` oder `link` oder `url`: externer Link
- `tags`: Liste von Schlagworten
- `photos` (Array) oder `images` (Array): Fotos
  - Als String-Array: `["https://.../bild.jpg"]`
  - Oder als Objekte: `[{"url":"https://...","label":"Hof"}]`

Beispiel siehe [data/poi.geojson](data/poi.geojson).

### CSV → GeoJSON Import
- CSV-Datei kann im Edit-Modus über den Button „CSV“ geladen werden.
- Alternativ wird beim Start automatisch `data/poi.csv` geladen (falls vorhanden) oder du gibst die URL per `?csv=https://.../datei.csv` an.
- Erwartete Spalten (mindestens): `lat`, `lon` (oder Synonyme: `latitude`/`y`, `long`/`lng`/`x`).
- Optionale Spalten werden zu Properties:
  - `title`/`name`, `desc`/`description`, `address`, `hours`/`opening_hours`, `website`/`link`/`url`
  - `category`/`subject`: Kategorie (für Filter)
  - `tags`: mit `,` oder `;` getrennte Liste
  - `photos`/`images`: mit `,` oder `;` getrennte URLs
### Kategorien (Filter)
- Auswahl oben rechts mit Mehrfachauswahl (Checkboxen) – dynamisch aus den Daten.
- Vorbelegung via URL: `?category=Historie,Landwirtschaft` (Komma/Strichpunkt getrennt).
- Kategorie kommt aus `properties.category` (CSV: Spalte `category` oder `subject`).

Markerfarben:
- Historie: blau
- Landwirtschaft: braun
- Wildtiere & -pflanzen: dunkelgrün
- Nach dem Import werden Marker erzeugt; per „⤓POI“ kannst du die Daten als `poi.geojson` exportieren.

## Hosting
- GitHub Pages: Repo → Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
- WordPress: Statisch ausliefern, z. B. unter `/wp-content/uploads/xplore/`.
- Für produktive Nutzung nutze dedizierte Tile-Provider (MapTiler, Stadia, Thunderforest) oder Self-Hosting.

## Hinweise
- HTTPS: notwendig für Kamera/Sensorfunktionen.
- Attribution: OSM/Provider-Credits sichtbar lassen.
- API-Keys: Nicht committen; per Build/Server injizieren oder URL nur temporär nutzen.
