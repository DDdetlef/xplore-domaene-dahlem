// xplore Domäne Dahlem - Leaflet app with provider switch, bbox/zoom limits, and tile metrics

const map = L.map('map');

// Default BBox for Domäne Dahlem (from OSM Nominatim)
// Format: L.latLngBounds([minLat, minLon], [maxLat, maxLon])
const DEFAULT_BBOX_DOMAENE_DAHLEM = L.latLngBounds(
  [52.4581727, 13.2877241],
  [52.4601029, 13.2898741]
);

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  const v = params.get(name);
  return v ? v.trim() : '';
}

function parseBboxParam() {
  const raw = getQueryParam('bbox'); // minLon,minLat,maxLon,maxLat
  if (!raw) return null;
  const parts = raw.split(',').map((x) => parseFloat(x));
  if (parts.length !== 4 || parts.some((n) => !isFinite(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return L.latLngBounds([minLat, minLon], [maxLat, maxLon]);
}

function addBaseLayerFromProvider() {
  const providerName = getQueryParam('provider');
  const maxZoomParam = getQueryParam('maxzoom');
  const apiKey = getQueryParam('apikey');
  const maxZoom = maxZoomParam ? Math.max(0, Math.min(22, parseInt(maxZoomParam, 10) || 19)) : 19;

  if (providerName && L && L.tileLayer && typeof L.tileLayer.provider === 'function') {
    try {
      const opts = apiKey ? { maxZoom, apikey: apiKey, apiKey: apiKey, key: apiKey } : { maxZoom };
      const layer = L.tileLayer.provider(providerName, opts).addTo(map);
      console.log('Using provider:', providerName);
      return layer;
    } catch (e) {
      console.warn('Failed to use provider', providerName, e);
    }
  }

  const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  }).addTo(map);
  return layer;
}

// Apply bbox & zoom limits from URL (optional)
const bbox = parseBboxParam();
const minZoomParam = getQueryParam('minzoom');
const minZoom = minZoomParam ? Math.max(0, Math.min(22, parseInt(minZoomParam, 10) || 0)) : undefined;
const maxZoomParamMap = getQueryParam('maxzoom');
const maxZoomMap = maxZoomParamMap ? Math.max(0, Math.min(22, parseInt(maxZoomParamMap, 10) || 22)) : undefined;

if (typeof minZoom === 'number') map.setMinZoom(minZoom);
if (typeof maxZoomMap === 'number') map.setMaxZoom(maxZoomMap);
let activeBounds = null;
if (bbox) {
  activeBounds = bbox;
  map.setMaxBounds(activeBounds);
  map.fitBounds(activeBounds, { padding: [20, 20] });
} else if (DEFAULT_BBOX_DOMAENE_DAHLEM) {
  activeBounds = DEFAULT_BBOX_DOMAENE_DAHLEM;
  map.setMaxBounds(activeBounds);
  map.fitBounds(activeBounds, { padding: [20, 20] });
} else {
  map.setView([52.52, 13.405], 11);
}

// Dev bbox overlay removed per request

const baseLayer = addBaseLayerFromProvider();

// Simple tile metrics (only if ?metrics=1)
const enableMetrics = getQueryParam('metrics') === '1';
if (enableMetrics && baseLayer) {
  let totalTiles = 0;
  const unique = new Set();
  const hud = document.getElementById('boot-log');
  function getTilePixelSize() {
    try {
      const p = baseLayer.getTileSize ? baseLayer.getTileSize() : null;
      return p && p.x ? p.x : (baseLayer.options && baseLayer.options.tileSize) || 256;
    } catch (_) { return 256; }
  }
  function getTileCategory() {
    const s = getTilePixelSize();
    return s >= 512 ? 'raster-512' : 'raster-256'; // Leaflet tileLayer is raster
  }
  function tilesPerMapView() {
    const cat = getTileCategory();
    // Usage policy: 15 raster-tiles OR 4 raster-512 tiles per Map View
    return cat === 'raster-512' ? 4 : 15;
  }
  function countVisibleUniqueTiles() {
    try {
      const container = baseLayer.getContainer ? baseLayer.getContainer() : null;
      const list = container ? container.querySelectorAll('img.leaflet-tile') : [];
      const set = new Set();
      for (const img of list) {
        if (img && img.src) set.add(img.src);
      }
      return set.size;
    } catch (_) { return 0; }
  }
  function renderHud() {
    if (!hud) return;
    hud.style.display = 'block';
    const visible = countVisibleUniqueTiles();
    const policyTiles = tilesPerMapView();
    const mvVisible = visible / policyTiles;
    const cat = getTileCategory();
    hud.textContent = `Tiles loaded: ${totalTiles} | unique(session): ${unique.size} | visible: ${visible} (${cat}) | MV≈ ${mvVisible.toFixed(2)} (tiles/view=${policyTiles}) | z=${map.getZoom()}`;
  }
  baseLayer.on('tileloadstart', (e) => {
    totalTiles += 1;
    try { if (e && e.tile && e.tile.src) unique.add(e.tile.src); } catch (_) {}
    renderHud();
  });
  map.on('moveend zoomend', renderHud);
  renderHud();
}

// Load optional sample data if present
fetch('data/poi.geojson').then(r => {
  if (!r.ok) return Promise.reject(new Error('poi.geojson not found'));
  return r.json();
}).then(fc => {
  if (!fc || !Array.isArray(fc.features)) return;
  const markers = [];
  fc.features.forEach((f) => {
    if (!f || !f.geometry || f.geometry.type !== 'Point') return;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) return;
    const latlng = L.latLng(c[1], c[0]);
    const m = L.marker(latlng).bindPopup(String(f.properties && f.properties.title || 'POI'));
    m.addTo(map);
    markers.push(m);
  });
  if (markers.length > 0 && !bbox) {
    const g = L.featureGroup(markers);
    map.fitBounds(g.getBounds(), { padding: [20, 20] });
  }
}).catch(() => {
  // No sample data; keep default view
});

// Boundary polygon: load from data/bounds.geojson or use active bounds rectangle

(function initBoundaryPolygon() {
  const editMode = getQueryParam('edit') === '1';
  const group = L.featureGroup().addTo(map);

  function exportGeoJSON() {
    const fc = {
      type: 'FeatureCollection',
      features: []
    };
    group.eachLayer(layer => {
      if (layer.toGeoJSON) {
        const gj = layer.toGeoJSON();
        fc.features.push({ type: 'Feature', properties: { name: 'Domäne Dahlem Bounds' }, geometry: gj.geometry });
      }
    });
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bounds.geojson';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Try to load preexisting bounds.geojson
  fetch('data/bounds.geojson').then(r => {
    if (!r.ok) throw new Error('bounds.geojson not found');
    return r.json();
  }).then(gj => {
    const layer = L.geoJSON(gj, { style: { color: '#2a7', weight: 2, fillOpacity: 0.08 } });
    layer.addTo(group);
    try {
      const b = layer.getBounds && layer.getBounds();
      if (b && b.isValid && b.isValid()) {
        activeBounds = b;
        // Clamp map movement to the polygon bounds (with a tiny pad)
        map.setMaxBounds(b.pad(0.001));
        // Add extra top padding to ensure the polygon isn't clipped by controls
        map.fitBounds(b, { paddingTopLeft: [20, 60], paddingBottomRight: [20, 20] });
        // Ensure proper sizing if assets changed layout
        setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 0);
      }
    } catch (_) {}
  }).catch(() => {
    // No predefined bounds.geojson; start with empty group (user can draw)
  }).finally(() => {
    if (editMode) {
      const drawItems = group; // use existing group for editing
      const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawItems },
        draw: { polygon: true, polyline: false, circle: false, rectangle: true, marker: false, circlemarker: false }
      });
      map.addControl(drawControl);

      map.on(L.Draw.Event.CREATED, function (e) {
        const layer = e.layer;
        drawItems.addLayer(layer);
      });
      map.on(L.Draw.Event.EDITED, function () {
        // no-op; edits are in drawItems
      });

      // Export button control
      const ExportControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
          const container = L.DomUtil.create('div', 'leaflet-bar');
          const btn = L.DomUtil.create('a', '', container);
          btn.href = '#';
          btn.title = 'Export bounds.geojson';
          btn.textContent = '⤓';
          L.DomEvent.on(btn, 'click', L.DomEvent.stopPropagation)
                    .on(btn, 'click', L.DomEvent.preventDefault)
                    .on(btn, 'click', exportGeoJSON);
          return container;
        }
      });
      map.addControl(new ExportControl());

      // Import button control
      const ImportControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
          const container = L.DomUtil.create('div', 'leaflet-bar');
          const btn = L.DomUtil.create('a', '', container);
          btn.href = '#';
          btn.title = 'Import bounds.geojson';
          btn.textContent = '📥';
          const fileInput = L.DomUtil.create('input', '', container);
          fileInput.type = 'file';
          fileInput.accept = '.geojson,.json';
          fileInput.style.display = 'none';
          L.DomEvent.on(btn, 'click', L.DomEvent.stopPropagation)
                    .on(btn, 'click', L.DomEvent.preventDefault)
                    .on(btn, 'click', function () { fileInput.click(); });
          L.DomEvent.on(fileInput, 'change', function () {
            const f = fileInput.files && fileInput.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = function (e) {
              try {
                const gj = JSON.parse(String(e.target.result));
                drawItems.clearLayers();
                const layer = L.geoJSON(gj, { style: { color: '#2a7', weight: 2, fillOpacity: 0.08 } });
                layer.addTo(drawItems);
              } catch (err) {
                console.warn('Failed to import GeoJSON', err);
              }
            };
            reader.readAsText(f);
          });
          return container;
        }
      });
      map.addControl(new ImportControl());
    }
  });
})();
