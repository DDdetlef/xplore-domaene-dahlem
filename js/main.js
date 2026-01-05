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
const MAX_BOUNDS_PAD = 0.01; // small pad for UX when clamping to bounds

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
  let openPopupMarker = null;
  try { wasMobileOpen = isMobile() && isMobilePopupOpen(); } catch (_) {}
  try {
    if (!isMobile()) {
      // Prefer Leaflet's reference to the currently open popup source
      const p = map && map._popup;
      if (p && p._source) {
        openPopupMarker = p._source;
        wasMarkerPopupOpen = true;
      } else {
        wasMarkerPopupOpen = !!(lastClickedMarker && lastClickedMarker.isPopupOpen && lastClickedMarker.isPopupOpen());
        openPopupMarker = wasMarkerPopupOpen ? lastClickedMarker : null;
      }
    }
  } catch (_) {}

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

  // Do not forcibly close popups here; we'll update in-place if one is open

  // Refresh marker popup contents and click handlers
  try {
    poiMarkers.forEach(m => {
      const f = m && m.feature;
      if (!f) return;
      if (isMobile()) {
        try { m.off('click'); } catch (_) {}
        m.on('click', () => {
          const content = buildPoiPopupContent(f);
          openMobilePopup(content);
        });
      } else {
        try { m.off('click'); } catch (_) {}
        const maxW = Math.min(360, Math.floor(window.innerWidth * 0.92));
        const popupOpts = {
          maxWidth: maxW,
          autoPan: true,
          keepInView: true,
          autoPanPaddingTopLeft: L.point(30, 120),
          autoPanPaddingBottomRight: L.point(30, 50)
        };
        m.on('click', () => {
          const content = buildPoiPopupContent(f);
          const p = m.getPopup && m.getPopup();
          if (p && p.setContent) {
            try { p.setContent(content); } catch (_) {}
          } else {
            try { m.bindPopup(content, popupOpts); } catch (_) {}
          }
          try { m.openPopup && m.openPopup(); } catch (_) {}
        });
      }
    });
  } catch (_) {}

  // Update last clicked marker popup only if a popup was previously open
  try {
    const targetMarker = openPopupMarker || lastClickedMarker;
    if (targetMarker && targetMarker.feature && (wasMobileOpen || wasMarkerPopupOpen)) {
      const content = buildPoiPopupContent(targetMarker.feature);
      if (isMobile()) {
        // Update mobile overlay content without closing
        if (mobilePopupBodyEl) { try { mobilePopupBodyEl.innerHTML = content; } catch (_) {} }
        else { openMobilePopup(content); }
      } else if (wasMarkerPopupOpen) {
        // Desktop: update the existing popup content; keep it open
        const p = targetMarker.getPopup && targetMarker.getPopup();
        if (p && p.setContent) {
          try { p.setContent(content); } catch (_) {}
        } else if (targetMarker.bindPopup) {
          // Fallback in case popup instance was missing
          const maxW = Math.min(360, Math.floor(window.innerWidth * 0.92));
          const popupOpts = {
            maxWidth: maxW,
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: L.point(30, 120),
            autoPanPaddingBottomRight: L.point(30, 50)
          };
          try { targetMarker.bindPopup(content, popupOpts); } catch (_) {}
        }
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
// Compute and apply a minZoom so the map cannot zoom out beyond the (padded) active bounds
function updateMinZoomForBounds() {
  try {
    // Respect explicit ?minzoom= parameter if provided
    if (typeof minZoom === 'number') return;
    if (!activeBounds || !activeBounds.isValid || !activeBounds.isValid()) return;
    // Fit to a slightly padded bounds to show a bit of neighbourhood when fully zoomed out
    const padded = activeBounds.pad(MAX_BOUNDS_PAD);
    // 'inside' true => the zoom that fits the given bounds fully inside the view
    const z = map.getBoundsZoom(padded, true);
    if (isFinite(z)) {
      map.setMinZoom(z);
      // If current zoom is lower than allowed min, bump it up
      if (map.getZoom && map.getZoom() < z) { map.setZoom(z); }
    }
  } catch (_) {}
}
if (bbox) {
  activeBounds = bbox;
  map.setMaxBounds(activeBounds.pad(MAX_BOUNDS_PAD));
  map.fitBounds(activeBounds, { padding: [20, 20] });
  updateMinZoomForBounds();
} else if (DEFAULT_BBOX_DOMAENE_DAHLEM) {
  activeBounds = DEFAULT_BBOX_DOMAENE_DAHLEM;
  map.setMaxBounds(activeBounds.pad(MAX_BOUNDS_PAD));
  map.fitBounds(activeBounds, { padding: [20, 20] });
  updateMinZoomForBounds();
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

// Note: We rely on maxBounds for containment and do not clamp minZoom dynamically,
// so zoom controls remain usable. If you want to hard-limit zoom-out, set ?minzoom=.

// Extra safety: clamp view back inside active bounds after user interactions
function clampViewToActiveBounds() {
  try {
    if (activeBounds && activeBounds.contains) {
      const padded = activeBounds.pad(MAX_BOUNDS_PAD);
      const c = map.getCenter();
      if (!padded.contains(c)) {
        map.panInsideBounds(padded, { animate: false });
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

// Layer group for POIs (markers): optional MarkerCluster for performance and UX
const CLUSTER_ENABLED = (function(){
  const raw = getQueryParam('cluster');
  if (!raw) return true; // default: enabled
  return String(raw).trim() !== '0';
})();
const poiLayer = (CLUSTER_ENABLED && L.markerClusterGroup ? L.markerClusterGroup({
  spiderfyOnMaxZoom: true,
  disableClusteringAtZoom: 18,
  maxClusterRadius: 40,
  showCoverageOnHover: false
}) : L.featureGroup()).addTo(map);
const poiMarkers = [];
let lastClickedMarker = null;
let selectedCategories = new Set();
// Track which data source is currently loaded: 'csv' or 'geojson'
let DATA_SOURCE = 'unknown';

function parseInitialCategories() {
  const raw = getQueryParam('category');
  if (!raw) return;
  raw.split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(s => selectedCategories.add(s));
}
parseInitialCategories();

function esc(s) {
  return String(s || '').replace(/[&<>"]+/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}
// Allowlist external URLs: only http/https (relative URLs are resolved against current origin)
function sanitizeUrl(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    // Resolve relative URLs against current origin
    const u = new URL(raw, window.location.origin);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    return '';
  } catch (_) { return ''; }
}
function buildPhotos(props) {
  const p = props.photos || props.images || [];
  if (!Array.isArray(p) || p.length === 0) return '';
  const items = p.map((x) => {
    const url = sanitizeUrl(typeof x === 'string' ? x : String(x && x.url || ''));
    const label = typeof x === 'string' ? '' : String(x && (x.label || x.title || ''));
    if (!url) return '';
    return `<a class=\"foto-icon\" href=\"${esc(url)}\" target=\"_blank\" rel=\"noopener noreferrer\" title=\"${esc(label)}\"><i class=\"fa fa-camera\"></i></a>`;
  }).filter(Boolean).join('');
  if (!items) return '';
  return `<div class=\"popup-fotos\">${items}</div>`;
}

function getPrimaryImage(props) {
  const im = (props && props.image) || '';
  if (im) return sanitizeUrl(String(im));
  const p = (props && (props.photos || props.images)) || [];
  if (Array.isArray(p) && p.length > 0) {
    const x = p[0];
    return sanitizeUrl(typeof x === 'string' ? x : String((x && x.url) || ''));
  }
  return '';
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
  // Language picker: for GeoJSON (partial i18n), avoid cross-language fallback to keep content consistent
  function pickLang(deVal, enVal) {
    const de = deVal || '';
    const en = enVal || '';
    if (DATA_SOURCE === 'geojson') {
      return currentLang === 'en' ? en : de;
    }
    return currentLang === 'en' ? (en || de) : (de || en);
  }
  // Subject and category, shown as breadcrumb "Category / Subject"
  const subject = pickLang(props.subject || '', props.subject_en || '');
  function categoryToLabel(cat) {
    const s = String(cat || '').trim();
    if (!s) return '';
    const low = s.toLowerCase();
    if (currentLang === 'en') {
      if (low === 'historie') return 'History';
      if (low === 'landwirtschaft') return 'Agriculture';
      if (low.includes('wildtier') || low.includes('wildtiere') || low.includes('pflanze') || low.includes('pflanzen')) return 'Wildlife';
    }
    return s;
  }
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
  const categoryLabel = categoryToLabel(props.category);
  const title = pickLang(props.title || props.name || '', props.title_en || props.name_en || '');
  const text = pickLang(props.text || props.desc || props.description || '', props.text_en || props.desc_en || props.description_en || '');
  const funfact = pickLang(props.funfact || '', props.funfact_en || '');
  const image = getPrimaryImage(props);
  const link = sanitizeUrl(props.link || props.url || props.website || '');

  const parts = [];
  const breadcrumb = categoryLabel && subject ? `${categoryLabel} / ${subject}` : (categoryLabel || subject);
  if (breadcrumb) {
    const icon = categoryToIcon(props.category);
    const color = categoryToColor(props.category);
    parts.push(
      `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">` +
      `<strong>${esc(breadcrumb)}</strong>` +
      (icon ? `<i class="fa fa-${esc(icon)}" style="color:${esc(color)};font-size:18px;margin-left:8px"></i>` : '') +
      `</div>`
    );
  }
  if (title) parts.push(`<h3 style=\"margin:4px 0\">${esc(title)}</h3>`);
  if (text) parts.push(formatTextToHTML(text));
  if (funfact) parts.push(`<div><strong>${esc(t('funfact_label'))}</strong> ${esc(funfact)}</div>`);
  if (image) parts.push(`<div style=\"margin-top:6px\"><img src=\"${esc(image)}\" alt=\"${esc(title || subject || 'Bild')}\" style=\"max-width:100%;height:auto;border-radius:4px\" loading=\"lazy\" decoding=\"async\" /></div>`);
  const photos = buildPhotos(props); // still supports optional photos[]
  if (photos) parts.push(photos);
  if (link) parts.push(`<div style=\"margin-top:6px;margin-bottom:10px\"><a href=\"${esc(link)}\" target=\"_blank\" rel=\"noopener noreferrer\">${esc(t('more_info'))}</a></div>`);
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
  const invalidate = debounce(function () { try { map.invalidateSize(); updateMinZoomForBounds(); } catch (_) {} }, 120);
  window.addEventListener('orientationchange', invalidate, { passive: true });
  window.addEventListener('resize', invalidate, { passive: true });
} catch (_) {}

// CSV support removed: the app now loads POIs exclusively from pre-generated GeoJSON.
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
    // Build popup content dynamically at click time to avoid stale or mixed-language content
    if (isMobile()) {
      m.on('click', () => {
        lastClickedMarker = m;
        const content = buildPoiPopupContent(f);
        openMobilePopup(content);
      });
    } else {
      m.bindPopup('', popupOpts);
      m.on('click', () => {
        lastClickedMarker = m;
        const content = buildPoiPopupContent(f);
        const p = m.getPopup && m.getPopup();
        if (p && p.setContent) p.setContent(content); else m.bindPopup(content, popupOpts);
        try { m.openPopup(); } catch (_) {}
      });
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
  const u = cacheBust('data/poi.geojson');
  return fetchWithRetry(u, {}, { retries: 2, timeoutMs: 5000, backoffMs: 800 })
    .then(r => { if (!r.ok) throw new Error('poi.geojson not found'); return r.json(); })
    .then(fc => {
      if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) throw new Error('poi empty');
      DATA_SOURCE = 'geojson';
      renderPOIFeatureCollection(fc);
      if (toast) showToast('POIs reloaded from GeoJSON');
      try { console.log('POIs source:', DATA_SOURCE); } catch (_) {}
      return true;
    })
    .catch((err) => {
      if (toast) showToast({ text: 'Reload failed — tap to retry', duration: 4000, onClick: function () { try { reloadPOIs({ toast: true }); } catch (_) {} } });
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
        map.setMaxBounds(b.pad(MAX_BOUNDS_PAD));
        // Add extra top padding to ensure the polygon isn't clipped by controls
        map.fitBounds(b, { paddingTopLeft: [20, 60], paddingBottomRight: [20, 20] });
        // Recompute min zoom based on new bounds
        try { updateMinZoomForBounds(); } catch (_) {}
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

      // POI Export control
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
      const PoiExportControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
          const container = L.DomUtil.create('div', 'leaflet-bar');
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
      map.addControl(new PoiExportControl());

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
