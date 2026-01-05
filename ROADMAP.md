# Project Roadmap & Recommendations

This document outlines pragmatic next steps to evolve the Domäne Dahlem map, focused on reliability, performance, and maintainability.

## Goals
- Robust data pipeline: CSV → GeoJSON with validation
- Clean UX on mobile/desktop with accessible controls
- Minimal dependencies and simple hosting
- Measurable performance and observability

## Immediate Next Steps
- Bounds validation in CI: ensure all POIs lie within [data/bounds.geojson](data/bounds.geojson)
- GeoJSON schema checks (required fields, category enum, i18n fields)
- Add a link to this roadmap in [README.md](README.md)

## Data Pipeline
- Enforce unique IDs per POI and stable ordering in [data/poi.geojson](data/poi.geojson)
- Category normalization (fixed list, case-insensitive matching)
- CSV hygiene: no extra headers/blank lines; semicolon delimiter
- Converter hardening in [scripts/csv_to_geojson.ps1](scripts/csv_to_geojson.ps1):
  - Strict parsing with errors surfaced in CI
  - Coordinate sanity check; swap heuristic retained
  - Validate photo URLs (optional HEAD check)

## Photo Attribution (Plan)
- CSV (Variant A — numbered columns; Excel-friendly):
  - Primary image: `image`, `image_author`, `image_author_url`, `image_license`, `image_license_url`
  - Additional photos (repeat pattern as needed, e.g., up to 3):
    - `photo1_url`, `photo1_author`, `photo1_author_url`, `photo1_license`, `photo1_license_url`
    - `photo2_url`, `photo2_author`, `photo2_author_url`, `photo2_license`, `photo2_license_url`
    - `photo3_url`, `photo3_author`, `photo3_author_url`, `photo3_license`, `photo3_license_url`
- Converter mapping (GeoJSON properties):
  - `image`: primary URL (kept for immediate popup image)
  - `image_attribution`: `{ author, author_url, license, license_url }`
  - `photos`: array of `{ url, author, author_url, license, license_url }` built from `photoN_*`
- CI validation (optional to enforce quality):
  - If `image` exists → require `image_author` and `image_license` (fail CI if missing)
  - Warn if `*_url` fields are present but not valid URLs
  - Limit `photoN_*` to N≤3 by default; ignore extra sets
- Frontend rendering plan (popups):
  - Show primary image as today; beneath it: `Foto: <author> — <license>` with links to `author_url` and `license_url`
  - For multiple photos: keep camera icons; tooltip or small caption with author/license, or open link to source
  - Sanitize all displayed text; no HTML injection from CSV

## CI/CD
- Extend [.github/workflows/geojson.yml](.github/workflows/geojson.yml):
  - Step: point-in-polygon validation against bounds
  - Step: fail if features < 1 or categories outside enum
  - Cache PowerShell modules if used
  - Add status badge for validation results
- Optional: Release artifact with built site (for GitHub Pages)

## Map UX
- Zoom HUD: optional `?showzoom=1` small badge near controls
- Self-hosted tiles: support `?tilesUrl=https://tiles.example.com/{z}/{x}/{y}.png` with fallback to OSM
- Category control: keyboard navigation and focus styles
- Popup content: consistent typography; image aspect handling; graceful link errors
- Optional: Marker clustering if POIs grow (Leaflet.markercluster)

## Performance
- Maintain Save-Data behavior (already detected in [js/main.js](js/main.js))
- Image optimization: compress and size primary images; `loading=lazy` retained
- Tile strategy: cap `maxzoom` for low-end devices; prefer canvas renderer when beneficial
- Network: keep retries/backoff; consider CDN for static assets

## Accessibility (A11y)
- Ensure proper ARIA on filter toggle and language selector
- Trap focus within mobile popup; ESC to close on desktop
- High-contrast mode testing; larger hit areas on mobile

## Internationalization (i18n)
- Externalize strings to `i18n/de.json` and `i18n/en.json`
- Avoid mixed-language fallbacks for GeoJSON fields (already addressed)
- Test language switching with open popups (already improved)

## Offline & Tiles
- Optional service worker for offline shell and cached GeoJSON
- Document storage estimates for self-hosted tiles up to z=18
- Switchable provider via `?provider=` and `?apikey=` (already supported)

## Testing
- Basic smoke tests: load map, tiles present, POIs render, popup opens
- Data validation tests: categories recognized, i18n fields present
- Optional end-to-end (Playwright) for filter/language interactions

## Documentation
- Update [README.md](README.md) with a link to this roadmap and CI overview
- Add CONTRIBUTING.md: branch strategy (`main` with CI, `local` for legacy)
- Troubleshooting section for CSV and bounds issues

## Observability
- Keep `?metrics=1` HUD; optionally emit minimal console timings
- Error reporting: capture and summarize fetch errors (no PII)

## Security
- Content Security Policy suggestion in [index.html](index.html)
- Sanitize popup content (kept) and ensure no HTML injection from data
- Prefer SRI for third-party CDNs when possible

## Backlog Ideas
- Edit mode improvements: import/export POIs with lightweight editor
- Optional attribution for photos (license and source)
- Thematic layers (e.g., historic routes) via separate GeoJSON files
