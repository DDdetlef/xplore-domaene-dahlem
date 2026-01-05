// xplore Domäne Dahlem - Leaflet app with provider switch, bbox/zoom limits, and tile metrics

// Network and device context (Save-Data / low-end detection)
function getNetworkContext() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const saveData = !!(c && c.saveData);
    const effectiveType = (c && c.effectiveType) || '';
    const downlink = (c && typeof c.downlink === 'number') ? c.downlink : null; // Mbps
    const lowEnd = saveData || effectiveType.includes('2g') || effectiveType.includes('slow-2g') || (typeof downlink === 'number' && downlink < 1);
    return { saveData, effectiveType, downlink, lowEnd };
  } catch (_) {
    return { saveData: false, effectiveType: '', downlink: null, lowEnd: false };
  }
}
const NET = getNetworkContext();

const map = L.map('map', {
  maxBoundsViscosity: 1.0,
  preferCanvas: !!NET.lowEnd,
  fadeAnimation: !NET.lowEnd,
  zoomAnimation: !NET.lowEnd
});

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

// Simple i18n (DE/EN)
const LANGS = ['de', 'en'];
function detectLanguage() {
  try {
    const q = getQueryParam('lang');
    const stored = localStorage.getItem('lang') || '';
    const doc = (document.documentElement && document.documentElement.lang) || 'de';
    const cand = (q || stored || doc || 'de').toLowerCase().slice(0, 2);
    return LANGS.includes(cand) ? cand : 'de';
  } catch (_) { return 'de'; }
}
let currentLang = detectLanguage();
function t(key) {
  const dict = {
    de: { back: 'Zurück', filter: 'Filter', category: 'Kategorie', all: 'Alle', funfact_label: 'Fun Fact:', more_info: 'Mehr Infos', data_saver_hint: 'Datensparmodus aktiv — geringere Details' },
    en: { back: 'Back',   filter: 'Filter', category: 'Category', all: 'All',  funfact_label: 'Fun fact:', more_info: 'More info', data_saver_hint: 'Data Saver active — reduced detail' }
  };
  const d = dict[currentLang] || dict.de;
  return d[key] || key;
}
function setLanguage(lang) {
  if (!LANGS.includes(lang)) return;
  // Remember whether a popup is currently open
  let wasMobileOpen = false;
  let wasMarkerPopupOpen = false;
  try { wasMobileOpen = isMobile() && isMobilePopupOpen(); } catch (_) {}
  try { wasMarkerPopupOpen = !isMobile() && !!(lastClickedMarker && lastClickedMarker.isPopupOpen && lastClickedMarker.isPopupOpen()); } catch (_) {}

  currentLang = lang;
  try { localStorage.setItem('lang', lang); } catch (_) {}
  try { document.documentElement.lang = lang; } catch (_) {}

  const backBtn = document.getElementById('mp-back');
  if (backBtn) {
    backBtn.setAttribute('aria-label', t('back'));
    const sp = backBtn.querySelector('span');
    if (sp) sp.textContent = t('back');
  }

  try { if (Array.isArray(lastCategoryList) && lastCategoryList.length) buildOrUpdateCategoryControl(lastCategoryList); } catch (_) {}

  // Close existing popups to avoid stale content
  try { closeMobilePopup(); } catch (_) {}
  try { map.closePopup && map.closePopup(); } catch (_) {}

  // Refresh marker popup contents and click handlers
  try {
    poiMarkers.forEach(m => {
      const f = m && m.feature;
      if (!f) return;
      const content = buildPoiPopupContent(f);
      if (isMobile()) {
        try { m.off('click'); } catch (_) {}
        m.on('click', () => openMobilePopup(content));
      } else {
        if (m.getPopup && m.getPopup()) {
          try { m.getPopup().setContent(content); } catch (_) {}
        } else {
          const maxW = Math.min(360, Math.floor(window.innerWidth * 0.92));
          const popupOpts = {
            maxWidth: maxW,
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: L.point(30, 120),
            autoPanPaddingBottomRight: L.point(30, 50)
          };
          try { m.bindPopup(content, popupOpts); } catch (_) {}
        }
      }
    });
  } catch (_) {}

  // Reopen last clicked marker popup only if a popup was previously open
  try {
    if (lastClickedMarker && lastClickedMarker.feature && (wasMobileOpen || wasMarkerPopupOpen)) {
      const content = buildPoiPopupContent(lastClickedMarker.feature);
      if (isMobile()) {
        openMobilePopup(content);
      } else if (lastClickedMarker.openPopup) {
        if (lastClickedMarker.getPopup && lastClickedMarker.getPopup()) {
          lastClickedMarker.getPopup().setContent(content);
        }
        lastClickedMarker.openPopup();
      }
    }
  } catch (_) {}
}

let lastCategoryList = [];

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
  const requestedMaxZoom = maxZoomParam ? Math.max(0, Math.min(22, parseInt(maxZoomParam, 10) || 19)) : 19;
  const maxZoom = (NET.lowEnd || NET.saveData) ? Math.min(requestedMaxZoom, 17) : requestedMaxZoom;
  
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
    maxZoom: maxZoom,
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
let boundaryGeoJSON = null; // precise polygon for containment checks
if (bbox) {
  activeBounds = bbox;
  map.setMaxBounds(activeBounds.pad(0.01));
  map.fitBounds(activeBounds, { padding: [20, 20] });
} else if (DEFAULT_BBOX_DOMAENE_DAHLEM) {
  activeBounds = DEFAULT_BBOX_DOMAENE_DAHLEM;
  map.setMaxBounds(activeBounds.pad(0.01));
  map.fitBounds(activeBounds, { padding: [20, 20] });
} else {
  map.setView([52.52, 13.405], 11);
}

// Dev bbox overlay removed per request

const baseLayer = addBaseLayerFromProvider();
// Ensure map maxZoom does not exceed layer maxZoom when not explicitly set
try {
  const layerMax = (baseLayer && baseLayer.options && baseLayer.options.maxZoom) || 19;
  if (typeof maxZoomMap !== 'number') { map.setMaxZoom(layerMax); }
} catch (_) {}

// Extra safety: clamp view back inside active bounds after user interactions
function clampViewToActiveBounds() {
  try {
    if (activeBounds && activeBounds.contains) {
      const c = map.getCenter();
      if (!activeBounds.contains(c)) {
        map.panInsideBounds(activeBounds, { animate: false });
      }
    }
  } catch (_) {}
}
try {
  map.on('dragend', clampViewToActiveBounds);
  map.on('zoomend', clampViewToActiveBounds);
} catch (_) {}
// Show connection-aware hint for Save-Data or low-end connections
try {
  if (NET && (NET.lowEnd || NET.saveData)) {
    showToast({ text: t('data_saver_hint'), duration: 5000 });
  }
} catch (_) {}

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

// Simple toast utility using #boot-log element
function showToast(msg) {
  try {
    const el = document.getElementById('boot-log');
    if (!el) return;
    const text = (typeof msg === 'string') ? msg : String((msg && msg.text) || '');
    const duration = (msg && msg.duration) ? msg.duration : 2000;
    el.textContent = text;
    el.style.display = 'block';
    el.style.cursor = (msg && typeof msg.onClick === 'function') ? 'pointer' : '';
    if (el._hideTimer) clearTimeout(el._hideTimer);
    if (el._clickHandler) { try { el.removeEventListener('click', el._clickHandler); } catch (_) {} }
    if (msg && typeof msg.onClick === 'function') {
      el._clickHandler = function () { try { msg.onClick(); } catch (_) {} };
      el.addEventListener('click', el._clickHandler);
    } else {
      el._clickHandler = null;
    }
    el._hideTimer = setTimeout(() => {
      try {
        el.style.display = 'none';
        if (el._clickHandler) { el.removeEventListener('click', el._clickHandler); el._clickHandler = null; }
      } catch (_) {}
    }, duration);
  } catch (_) {}
}

// Layer group for POIs (markers) to allow import/export
const poiLayer = L.featureGroup().addTo(map);
const poiMarkers = [];
let lastClickedMarker = null;
let selectedCategories = new Set();
function parseInitialCategories() {
  const raw = getQueryParam('category');
  if (!raw) return;
  raw.split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(s => selectedCategories.add(s));
}
parseInitialCategories();

function esc(s) {
  return String(s || '').replace(/[&<>"]+/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}
function buildPhotos(props) {
  const p = props.photos || props.images || [];
  if (!Array.isArray(p) || p.length === 0) return '';
  const items = p.map((x) => {
    const url = typeof x === 'string' ? x : String(x && x.url || '');
    const label = typeof x === 'string' ? '' : String(x && (x.label || x.title || ''));
    if (!url) return '';
    return `<a class=\"foto-icon\" href=\"${esc(url)}\" target=\"_blank\" rel=\"noopener\" title=\"${esc(label)}\"><i class=\"fa fa-camera\"></i></a>`;
  }).filter(Boolean).join('');
  if (!items) return '';
  return `<div class=\"popup-fotos\">${items}</div>`;
}

// Convert plain text with line breaks into HTML paragraphs.
// Rule: double line break (blank line) → new paragraph; single line break → <br>
function formatTextToHTML(raw) {
  const s = String(raw || '');
  if (!s) return '';
  const paras = s.split(/\n{2,}/);
  return paras.map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}
function buildPoiPopupContent(f) {
  const props = f && f.properties ? f.properties : {};
  function pickLang(deVal, enVal) { return currentLang === 'en' ? (enVal || deVal || '') : (deVal || enVal || ''); }
  const subject = pickLang(props.subject || '', props.subject_en || '');
  const title = pickLang(props.title || props.name || '', props.title_en || props.name_en || '');
  const text = pickLang(props.text || props.desc || props.description || '', props.text_en || props.desc_en || props.description_en || '');
  const funfact = pickLang(props.funfact || '', props.funfact_en || '');
  const image = props.image || '';
  const link = props.link || props.url || props.website || '';

  const parts = [];
  if (subject) parts.push(`<div><strong>${esc(subject)}</strong></div>`);
  if (title) parts.push(`<h3 style=\"margin:4px 0\">${esc(title)}</h3>`);
  if (text) parts.push(formatTextToHTML(text));
  if (funfact) parts.push(`<div><strong>${esc(t('funfact_label'))}</strong> ${esc(funfact)}</div>`);
  if (image) parts.push(`<div style=\"margin-top:6px\"><img src=\"${esc(image)}\" alt=\"${esc(title || subject || 'Bild')}\" style=\"max-width:100%;height:auto;border-radius:4px\" loading=\"lazy\" decoding=\"async\" /></div>`);
  const photos = buildPhotos(props); // still supports optional photos[]
  if (photos) parts.push(photos);
  if (link) parts.push(`<div style=\"margin-top:6px;margin-bottom:10px\"><a href=\"${esc(link)}\" target=\"_blank\" rel=\"noopener\">${esc(t('more_info'))}</a></div>`);
  const html = parts.join('');
  return `<div>${html}</div>`;
}

// Mobile full-screen popup overlay helpers
const mobilePopupEl = document.getElementById('mobile-popup');
const mobilePopupBodyEl = document.getElementById('mp-body');
const mobilePopupBackEl = document.getElementById('mp-back');
function isMobile() {
  try { return window.matchMedia && window.matchMedia('(max-width: 480px)').matches; } catch (_) { return (window.innerWidth || 800) <= 480; }
}
function isMobilePopupOpen() {
  try { return !!(mobilePopupEl && mobilePopupEl.getAttribute('aria-hidden') === 'false' && mobilePopupEl.style.display !== 'none'); } catch (_) { return false; }
}
function openMobilePopup(html) {
  if (!mobilePopupEl || !mobilePopupBodyEl) return;
  mobilePopupBodyEl.innerHTML = html;
  mobilePopupEl.style.display = 'block';
  mobilePopupEl.setAttribute('aria-hidden', 'false');
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
}
function closeMobilePopup() {
  if (!mobilePopupEl || !mobilePopupBodyEl) return;
  mobilePopupEl.style.display = 'none';
  mobilePopupEl.setAttribute('aria-hidden', 'true');
  mobilePopupBodyEl.innerHTML = '';
  try { document.body.style.overflow = ''; } catch (_) {}
}
if (mobilePopupBackEl) {
  mobilePopupBackEl.addEventListener('click', () => closeMobilePopup());
}

// Initialize language-dependent UI text (back button)
setLanguage(currentLang);

// Improve mobile robustness: ensure map resizes correctly on viewport changes (debounced)
function debounce(fn, wait) {
  let t = null;
  return function () {
    const ctx = this, args = arguments;
    if (t) clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, wait);
  };
}
try {
  const invalidate = debounce(function () { try { map.invalidateSize(); } catch (_) {} }, 120);
  window.addEventListener('orientationchange', invalidate, { passive: true });
  window.addEventListener('resize', invalidate, { passive: true });
} catch (_) {}

// Parse CSV to GeoJSON (top-level), recognizing subject, title, text, funfact, image, link
function parseCSVToGeoJSON(text) {
  const result = (window.Papa && window.Papa.parse) ? window.Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ';' }) : { data: [] };
  const rows = result.data || [];
  const features = [];
  rows.forEach(row => {
    const get = (k) => row[k] || (k ? row[k.toLowerCase()] : '') || '';
    function num(v) { return parseFloat(String(v || '').replace(',', '.')); }
    let lat = num(get('latitude') || get('lat') || get('y'));
    let lon = num(get('longitude') || get('lon') || get('long') || get('lng') || get('x'));
    // Auto-fix swapped coordinates (common issue: lat=13, lon=52 → Berlin)
    if (isFinite(lat) && isFinite(lon)) {
      const looksSwapped = Math.abs(lat) <= 35 && Math.abs(lon) >= 35;
      if (looksSwapped) { const tmp = lat; lat = lon; lon = tmp; }
    }
    if (!isFinite(lat) || !isFinite(lon)) return;
    const props = {};
    const category = get('category') || '';
    const subject = get('subject') || '';
    const subject_en = get('subject_en') || '';
    const title = get('title') || get('name') || '';
    const title_en = get('title_en') || get('name_en') || '';
    const text = get('text') || get('desc') || get('description') || '';
    const text_en = get('text_en') || get('desc_en') || get('description_en') || '';
    const funfact = get('funfact') || '';
    const funfact_en = get('funfact_en') || '';
    const image = get('image') || '';
    const link = get('link') || get('website') || get('url') || '';
    if (category) props.category = category;
    if (subject) props.subject = subject;
    if (subject_en) props.subject_en = subject_en;
    if (title) props.title = title;
    if (title_en) props.title_en = title_en;
    if (text) props.text = text;
    if (text_en) props.text_en = text_en;
    if (funfact) props.funfact = funfact;
    if (funfact_en) props.funfact_en = funfact_en;
    if (image) { props.image = image; props.photos = [{ url: image }]; }
    if (link) props.link = link;
    features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
  });
  return { type: 'FeatureCollection', features };
}

// CSV validator: filters invalid rows and summarizes issues
function parseCSVValidated(text) {
  const result = (window.Papa && window.Papa.parse) ? window.Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ';' }) : { data: [] };
  const rows = result.data || [];
  const features = [];
  const issues = [];
  function num(v) { return parseFloat(String(v || '').replace(',', '.')); }
  function maybeSwap(lat, lon) {
    if (!isFinite(lat) || !isFinite(lon)) return [lat, lon];
    const looksSwapped = Math.abs(lat) <= 35 && Math.abs(lon) >= 35;
    return looksSwapped ? [lon, lat] : [lat, lon];
  }
  function ptInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) &&
                        (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function ptInPolygon(lon, lat, geom) {
    if (!geom) return false;
    if (geom.type === 'Polygon') {
      const rings = geom.coordinates || [];
      if (!rings.length) return false;
      const insideOuter = ptInRing(lon, lat, rings[0]);
      if (!insideOuter) return false;
      for (let k = 1; k < rings.length; k++) { if (ptInRing(lon, lat, rings[k])) return false; }
      return true;
    }
    if (geom.type === 'MultiPolygon') {
      const polys = geom.coordinates || [];
      for (const poly of polys) {
        const rings = poly || [];
        if (!rings.length) continue;
        const insideOuter = ptInRing(lon, lat, rings[0]);
        if (!insideOuter) continue;
        let inHole = false;
        for (let k = 1; k < rings.length; k++) { if (ptInRing(lon, lat, rings[k])) { inHole = true; break; } }
        if (!inHole) return true;
      }
      return false;
    }
    return false;
  }
  function withinBounds(lat, lon) {
    try {
      if (boundaryGeoJSON && boundaryGeoJSON.features && boundaryGeoJSON.features.length) {
        for (const f of boundaryGeoJSON.features) {
          const g = f && f.geometry;
          if (g && ptInPolygon(lon, lat, g)) return true;
        }
        return false;
      }
      const ll = L.latLng(lat, lon);
      if (activeBounds && activeBounds.contains) return activeBounds.contains(ll);
      return lat > 52 && lat < 53 && lon > 13 && lon < 14;
    } catch (_) { return true; }
  }
  rows.forEach((row, idx) => {
    const get = (k) => row[k] || (k ? row[k.toLowerCase()] : '') || '';
    let lat = num(get('latitude') || get('lat') || get('y'));
    let lon = num(get('longitude') || get('lon') || get('long') || get('lng') || get('x'));
    [lat, lon] = maybeSwap(lat, lon);
    if (!isFinite(lat) || !isFinite(lon)) { issues.push({ row: idx + 2, reason: 'Missing/invalid coordinates' }); return; }
    if (!withinBounds(lat, lon)) { issues.push({ row: idx + 2, reason: 'Coordinates outside bounds' }); return; }
    const props = {};
    const category = get('category') || '';
    const subject = get('subject') || '';
    const subject_en = get('subject_en') || '';
    const title = get('title') || get('name') || '';
    const title_en = get('title_en') || get('name_en') || '';
    const text = get('text') || get('desc') || get('description') || '';
    const text_en = get('text_en') || get('desc_en') || get('description_en') || '';
    const funfact = get('funfact') || '';
    const funfact_en = get('funfact_en') || '';
    const image = get('image') || '';
    const link = get('link') || get('website') || get('url') || '';
    if (category) props.category = category;
    if (subject) props.subject = subject;
    if (subject_en) props.subject_en = subject_en;
    if (title) props.title = title;
    if (title_en) props.title_en = title_en;
    if (text) props.text = text;
    if (text_en) props.text_en = text_en;
    if (funfact) props.funfact = funfact;
    if (funfact_en) props.funfact_en = funfact_en;
    if (image) { props.image = image; props.photos = [{ url: image }]; }
    if (link) props.link = link;
    features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
  });
  return { fc: { type: 'FeatureCollection', features }, stats: { valid: features.length, invalid: issues.length, issues } };
}
function renderPOIFeatureCollection(fc) {
  poiLayer.clearLayers();
  poiMarkers.length = 0;
  const markers = [];
  const catSet = new Set();
  (fc.features || []).forEach((f) => {
    if (!f || !f.geometry || f.geometry.type !== 'Point') return;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) return;
    const latlng = L.latLng(c[1], c[0]);
    let m;
    const props = (f && f.properties) || {};
    function categoryToColor(cat) {
      const s = String(cat || '').toLowerCase();
      if (s === 'historie') return 'blue';
      if (s === 'landwirtschaft') return 'orange';
      if (s.indexOf('wildtiere') !== -1) return 'darkgreen';
      return 'cadetblue';
    }
    function categoryToIcon(cat) {
      const s = String(cat || '').toLowerCase();
      if (s === 'historie') return 'university';
      if (s === 'landwirtschaft') return 'leaf';
      if (s.includes('wildtier') || s.includes('wildtiere') || s.includes('pflanze') || s.includes('pflanzen')) return 'paw';
      return 'map-marker';
    }
    function categoryToIconColor(cat) {
      const s = String(cat || '').toLowerCase();
      if (s === 'historie') return 'white';
      return 'black';
    }
    const color = categoryToColor(props.category);
    const maxW = Math.min(360, Math.floor(window.innerWidth * 0.92));
    const popupOpts = {
      maxWidth: maxW,
      autoPan: true,
      keepInView: true,
      autoPanPaddingTopLeft: L.point(30, 120),
      autoPanPaddingBottomRight: L.point(30, 50)
    };
    if (L.AwesomeMarkers && L.AwesomeMarkers.icon) {
      const icon = L.AwesomeMarkers.icon({ icon: categoryToIcon(props.category), prefix: 'fa', markerColor: color, iconColor: categoryToIconColor(props.category) });
      m = L.marker(latlng, { icon });
    } else {
      m = L.marker(latlng);
    }
    const content = buildPoiPopupContent(f);
    if (isMobile()) {
      m.on('click', () => { lastClickedMarker = m; openMobilePopup(content); });
    } else {
      m.on('click', () => { lastClickedMarker = m; });
      m.bindPopup(content, popupOpts);
    }
    m.addTo(poiLayer);
    m.feature = f;
    markers.push(m);
    poiMarkers.push(m);
    if (props.category) catSet.add(String(props.category).trim());
  });
  if (markers.length > 0 && !bbox) {
    const g = L.featureGroup(markers);
    map.fitBounds(g.getBounds(), { padding: [20, 20] });
  }
  const cats = Array.from(catSet).sort();
  lastCategoryList = cats;
  buildOrUpdateCategoryControl(cats);
}

// Load/Reload POIs: prefer CSV (param or data/poi.csv), fallback to data/poi.geojson
function reloadPOIs(opts) {
  const toast = !!(opts && opts.toast);
  const csvParam = getQueryParam('csv');
  const cacheBust = (u) => u ? (u + (u.indexOf('?') === -1 ? '?' : '&') + 'v=' + Date.now()) : u;
  function fetchWithRetry(url, options, retryOpts) {
    const retries = (retryOpts && retryOpts.retries) || 2;
    const timeoutMs = (retryOpts && retryOpts.timeoutMs) || 5000;
    const backoffMs = (retryOpts && retryOpts.backoffMs) || 600;
    function attempt(n) {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, timeoutMs);
      const o = Object.assign({}, options || {}, { signal: ctrl.signal });
      return fetch(url, o).finally(() => { clearTimeout(t); }).catch(err => {
        if (n < retries) {
          return new Promise(res => setTimeout(res, backoffMs * (n + 1))).then(() => attempt(n + 1));
        }
        throw err;
      });
    }
    return attempt(0);
  }
  function tryCSV(url) {
    const u = cacheBust(url);
    return fetchWithRetry(u, {}, { retries: 2, timeoutMs: 5000, backoffMs: 800 })
      .then(r => { if (!r.ok) throw new Error('csv not found'); return r.text(); })
      .then(text => {
        const res = parseCSVValidated(text);
        const fc = res.fc;
        if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) throw new Error('csv empty');
        renderPOIFeatureCollection(fc);
        if (toast) showToast(`POIs reloaded (${res.stats.valid} ok, ${res.stats.invalid} invalid)`);
        if (res.stats.invalid) console.warn('CSV issues:', res.stats.issues);
        return true;
      });
  }
  function tryGeoJSON() {
    const u = cacheBust('data/poi.geojson');
    return fetchWithRetry(u, {}, { retries: 2, timeoutMs: 5000, backoffMs: 800 })
      .then(r => { if (!r.ok) throw new Error('poi.geojson not found'); return r.json(); })
      .then(fc => { if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) throw new Error('poi empty'); renderPOIFeatureCollection(fc); if (toast) showToast('POIs reloaded'); return true; });
  }
  const chain = csvParam ? tryCSV(csvParam).catch(() => tryGeoJSON())
                         : tryCSV('data/poi.csv').catch(() => tryGeoJSON());
  return chain.catch((err) => {
    if (toast) showToast({ text: 'Reload failed — tap to retry', duration: 4000, onClick: function () { try { reloadPOIs({ toast: true }); } catch (_) {} } });
    // neither CSV nor GeoJSON present; keep default view
  });
}
// Initial load
reloadPOIs();

function applyCategoryFilterFromSet() {
  const wantAll = selectedCategories.size === 0 || Array.from(selectedCategories).some(v => {
    const s = String(v).toLowerCase();
    return s === 'alle' || s === 'all';
  });
  poiMarkers.forEach(m => {
    const props = (m.feature && m.feature.properties) || {};
    const mc = String(props.category || '').trim().toLowerCase();
    const match = Array.from(selectedCategories).some(v => mc === String(v).toLowerCase());
    const show = wantAll || match;
    if (show) poiLayer.addLayer(m); else poiLayer.removeLayer(m);
  });
}

let categoryControlInstance = null;
function buildOrUpdateCategoryControl(categories) {
  try { if (categoryControlInstance) map.removeControl(categoryControlInstance); } catch (_) {}
  const MultiCategoryControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar');

      // Header with burger toggle (mobile collapsible)
      const header = L.DomUtil.create('div', '', container);
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.background = 'rgba(255,255,255,0.9)';
      const toggle = L.DomUtil.create('button', '', header);
      toggle.setAttribute('type', 'button');
      toggle.title = t('filter');
      toggle.setAttribute('aria-label', t('filter'));
      toggle.style.display = 'inline-block';
      toggle.style.width = '34px';
      toggle.style.height = '34px';
      toggle.style.lineHeight = '34px';
      toggle.style.textAlign = 'center';
      toggle.style.cursor = 'pointer';
      toggle.style.background = 'transparent';
      toggle.style.border = 'none';
      toggle.style.padding = '0';
      toggle.style.margin = '0';
      toggle.style.touchAction = 'manipulation';
      toggle.innerHTML = '<i class="fa fa-bars"></i>';
      const headerText = L.DomUtil.create('span', '', header);
      headerText.textContent = ' ' + t('filter');
      headerText.style.padding = '0 8px';
      headerText.style.userSelect = 'none';

      // Language selector (DE/EN)
      const langSel = L.DomUtil.create('select', '', header);
      langSel.style.marginLeft = 'auto';
      langSel.style.marginRight = '6px';
      langSel.style.height = '28px';
      const optDe = document.createElement('option'); optDe.value = 'de'; optDe.textContent = 'DE';
      const optEn = document.createElement('option'); optEn.value = 'en'; optEn.textContent = 'EN';
      langSel.appendChild(optDe); langSel.appendChild(optEn);
      langSel.value = currentLang;
      L.DomEvent.on(langSel, 'change', function () { setLanguage(langSel.value); });

      const wrap = L.DomUtil.create('div', '', container);
      const wrapId = 'filter-wrap';
      try { wrap.id = wrapId; toggle.setAttribute('aria-controls', wrapId); } catch (_) {}
      wrap.style.padding = '6px';
      wrap.style.background = 'rgba(255,255,255,0.9)';
      wrap.style.maxWidth = '220px';
      if (window.innerWidth < 520) {
        wrap.style.maxWidth = '70vw';
        wrap.style.maxHeight = '40vh';
        wrap.style.overflowY = 'auto';
        wrap.style.display = 'none'; // collapsed by default on mobile
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        wrap.style.display = 'block';
        toggle.setAttribute('aria-expanded', 'true');
      }
      L.DomEvent.on(toggle, 'click', L.DomEvent.stopPropagation)
                .on(toggle, 'click', function () {
                  const isHidden = wrap.style.display === 'none';
                  wrap.style.display = isHidden ? 'block' : 'none';
                  toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
                });

      const title = L.DomUtil.create('div', '', wrap);
      title.textContent = t('category');
      function categoryToIcon(cat) {
        const s = String(cat || '').toLowerCase();
        if (s === 'historie') return 'university';
        if (s === 'landwirtschaft') return 'leaf';
        if (s.includes('wildtier') || s.includes('wildtiere') || s.includes('pflanze') || s.includes('pflanzen')) return 'paw';
        return 'map-marker';
      }
      function categoryToColor(cat) {
        const s = String(cat || '').toLowerCase();
        if (s === 'historie') return '#1f6feb'; // blue
        if (s === 'landwirtschaft') return '#8B4513'; // brown
        if (s.includes('wildtier') || s.includes('wildtiere') || s.includes('pflanze') || s.includes('pflanzen')) return '#006400'; // darkgreen
        return '#5f9ea0'; // cadetblue
      }
      function categoryToLabel(cat) {
        const s = String(cat || '').toLowerCase();
        if (currentLang === 'en') {
          if (s === 'historie') return 'History';
          if (s === 'landwirtschaft') return 'Agriculture';
          if (s.includes('wildtier') || s.includes('wildtiere') || s.includes('pflanze') || s.includes('pflanzen')) return 'Wildlife';
        }
        return cat;
      }
      const allId = 'cat_all';
      const allLabel = L.DomUtil.create('label', '', wrap);
      const allCb = document.createElement('input'); allCb.type = 'checkbox'; allCb.id = allId;
      const allSpan = document.createElement('span'); allSpan.textContent = ' ' + t('all');
      allLabel.style.display = 'flex';
      allLabel.style.alignItems = 'center';
      allLabel.style.margin = '2px 0';
      allLabel.appendChild(allCb); allLabel.appendChild(allSpan);
      wrap.appendChild(allLabel);
      const list = L.DomUtil.create('div', '', wrap);
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '4px';
      categories.forEach(cat => {
        const id = 'cat_' + btoa(unescape(encodeURIComponent(cat))).replace(/[^A-Za-z0-9]/g,'');
        const label = document.createElement('label');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.value = cat;
        const span = document.createElement('span'); span.textContent = ' ' + categoryToLabel(cat);
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.margin = '2px 0';
        label.appendChild(cb); label.appendChild(span);
        const iconEl = document.createElement('i');
        iconEl.className = 'fa fa-' + categoryToIcon(cat);
        iconEl.style.marginLeft = '6px';
        iconEl.style.color = categoryToColor(cat);
        label.appendChild(iconEl);
        list.appendChild(label);
        if (selectedCategories.size > 0 && Array.from(selectedCategories).some(v => String(v).toLowerCase() === cat.toLowerCase())) cb.checked = true;
        L.DomEvent.on(cb, 'change', function (e) {
          if (cb.checked) selectedCategories.add(cb.value); else selectedCategories.delete(cb.value);
          // Uncheck "Alle" when specific selection changes
          allCb.checked = false;
          applyCategoryFilterFromSet();
        });
      });
      // Initialize "Alle" checkbox based on empty selection
      allCb.checked = selectedCategories.size === 0 || Array.from(selectedCategories).some(v => { const s = String(v).toLowerCase(); return s === 'alle' || s === 'all'; });
      L.DomEvent.on(allCb, 'change', function () {
        if (allCb.checked) {
          selectedCategories.clear();
          // Uncheck all specific checkboxes
          Array.from(list.querySelectorAll('input[type=checkbox]')).forEach(el => { el.checked = false; });
        }
        applyCategoryFilterFromSet();
      });
      // Allow interacting with checkboxes without blocking their default behavior
      // Prevent map drag/zoom from clicks inside the control instead.
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      // Apply initial filter
      setTimeout(applyCategoryFilterFromSet, 0);
      return container;
    }
  });
  categoryControlInstance = new MultiCategoryControl();
  map.addControl(categoryControlInstance);
}

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
    boundaryGeoJSON = gj;
    const layer = L.geoJSON(gj, { style: { color: '#2a7', weight: 2, fillOpacity: 0.08 } });
    layer.addTo(group);
    try {
      const b = layer.getBounds && layer.getBounds();
      if (b && b.isValid && b.isValid()) {
        activeBounds = b;
        // Clamp map movement to the polygon bounds with a small pad for UX
        map.setMaxBounds(b.pad(0.01));
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

      // POI CSV Import and Export controls
      function exportPOIGeoJSON() {
        const fc = { type: 'FeatureCollection', features: [] };
        poiLayer.eachLayer(layer => {
          if (layer.getLatLng) {
            const ll = layer.getLatLng();
            const gj = layer.toGeoJSON && layer.toGeoJSON();
            const props = (gj && gj.properties) || {};
            fc.features.push({
              type: 'Feature',
              properties: props,
              geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] }
            });
          }
        });
        const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'poi.geojson';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      function parseCSVToGeoJSON(text) {
        return window.parseCSVToGeoJSON ? window.parseCSVToGeoJSON(text) : { type: 'FeatureCollection', features: [] };
      }

      const PoiCSVControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
          const container = L.DomUtil.create('div', 'leaflet-bar');
          const btnCSV = L.DomUtil.create('a', '', container);
          btnCSV.href = '#';
          btnCSV.title = 'Import POIs from CSV';
          btnCSV.textContent = 'CSV';
          const fileInput = L.DomUtil.create('input', '', container);
          fileInput.type = 'file';
          fileInput.accept = '.csv,text/csv';
          fileInput.style.display = 'none';
          L.DomEvent.on(btnCSV, 'click', L.DomEvent.stopPropagation)
                    .on(btnCSV, 'click', L.DomEvent.preventDefault)
                    .on(btnCSV, 'click', function () { fileInput.click(); });
          L.DomEvent.on(fileInput, 'change', function () {
            const f = fileInput.files && fileInput.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = function (e) {
              try {
                const res = parseCSVValidated(String(e.target.result));
                const fc = res.fc;
                poiLayer.clearLayers();
                const markers = [];
                fc.features.forEach(feat => {
                  const c = feat.geometry && feat.geometry.coordinates;
                  if (!c || c.length < 2) return;
                  const latlng = L.latLng(c[1], c[0]);
                  const m = L.marker(latlng);
                  const content = buildPoiPopupContent(feat);
                  if (isMobile()) {
                    m.on('click', () => openMobilePopup(content));
                  } else {
                    m.bindPopup(content);
                  }
                  m.addTo(poiLayer);
                  markers.push(m);
                });
                if (markers.length) {
                  const g = L.featureGroup(markers);
                  map.fitBounds(g.getBounds(), { padding: [20, 20] });
                }
                showToast(`CSV imported (${res.stats.valid} ok, ${res.stats.invalid} invalid)`);
                if (res.stats.invalid) console.warn('CSV issues:', res.stats.issues);
              } catch (err) {
                console.warn('Failed to import CSV as GeoJSON', err);
              }
            };
            reader.readAsText(f);
          });

          const btnExport = L.DomUtil.create('a', '', container);
          btnExport.href = '#';
          btnExport.title = 'Export POIs to poi.geojson';
          btnExport.textContent = '⤓POI';
          L.DomEvent.on(btnExport, 'click', L.DomEvent.stopPropagation)
                    .on(btnExport, 'click', L.DomEvent.preventDefault)
                    .on(btnExport, 'click', exportPOIGeoJSON);

          return container;
        }
      });
      map.addControl(new PoiCSVControl());

      // Reload POIs control (editorial view)
      const ReloadPOIsControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
          const container = L.DomUtil.create('div', 'leaflet-bar');
          const btn = L.DomUtil.create('a', '', container);
          btn.href = '#';
          btn.title = 'Reload POIs';
          btn.textContent = '↻POI';
          L.DomEvent.on(btn, 'click', L.DomEvent.stopPropagation)
                    .on(btn, 'click', L.DomEvent.preventDefault)
                    .on(btn, 'click', function () { try { reloadPOIs({ toast: true }); } catch (_) {} });
          return container;
        }
      });
      map.addControl(new ReloadPOIsControl());
    }
  });
})();
