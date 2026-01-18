#!/usr/bin/env python3
import csv
import json
import os
import re
from datetime import datetime

CSV_PATH = os.path.join('data', 'poi.csv')
GEOJSON_PATH = os.path.join('data', 'poi.geojson')


def normalize_num(s):
    if s is None:
        return None
    s = str(s).strip()
    if s == '':
        return None
    s = s.replace("'", '').replace(' ', '')
    # If contains comma (likely decimal separator), remove dots (thousands) and convert comma->dot
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif s.count('.') > 1:
        digits = ''.join(s.split('.'))
        if len(digits) > 2:
            s = digits[:2] + '.' + digits[2:]
        else:
            s = digits
    s = re.sub(r'[^0-9.\-]', '', s)
    try:
        return float(s)
    except Exception:
        digits = re.sub(r'\D', '', s)
        if not digits:
            return None
        if len(digits) > 2:
            try:
                return float(digits[:2] + '.' + digits[2:])
            except Exception:
                return None
        try:
            return float(digits)
        except Exception:
            return None


def read_csv_rows(path):
    with open(path, newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh, delimiter=';')
        rows = list(reader)
    return rows


def main():
    if not os.path.exists(CSV_PATH):
        print('CSV not found:', CSV_PATH)
        return

    if os.path.exists(GEOJSON_PATH):
        bak = GEOJSON_PATH + '.bak.' + datetime.now().strftime('%Y%m%d%H%M%S')
        os.replace(GEOJSON_PATH, bak)
        print('Backed up', GEOJSON_PATH, '->', bak)

    rows = read_csv_rows(CSV_PATH)
    if not rows:
        print('No rows in CSV')
        return

    # strip whitespace and any UTF-8 BOM from header cells
    header = [h.strip().lstrip('\ufeff') for h in rows[0]]
    # If header is like 'Column1', try to use the next row as real header or fall back to canonical names
    header_lc = [h.lower() for h in header]
    if any(h.startswith('column') for h in header_lc):
        if len(rows) > 1:
            candidate = [c.strip() for c in rows[1]]
            cand_lc = [c.lower() for c in candidate]
            if 'latitude' in cand_lc and 'longitude' in cand_lc:
                header = candidate
                header_lc = cand_lc
                data_start = 2
            else:
                # fallback canonical header by position
                header = ['ID', 'latitude', 'longitude', 'category', 'category_en', 'subject', 'subject_en', 'title', 'title_en', 'text', 'text_en', 'funfact', 'funfact_en', 'image', 'link']
                header_lc = [h.lower() for h in header]
                data_start = 1
        else:
            header = ['ID', 'latitude', 'longitude', 'category', 'category_en', 'subject', 'subject_en', 'title', 'title_en', 'text', 'text_en', 'funfact', 'funfact_en', 'image', 'link']
            header_lc = [h.lower() for h in header]
            data_start = 1
    else:
        data_start = 1

    # find latitude/longitude columns
    try:
        lat_idx = header_lc.index('latitude')
        lon_idx = header_lc.index('longitude')
    except ValueError:
        lat_idx = 1
        lon_idx = 2

    features = []
    for cols in rows[data_start:]:
        # pad cols if shorter
        while len(cols) < len(header):
            cols.append('')
        # skip row if it equals the header (Excel/CSV export quirks)
        if [c.strip().lower() for c in cols] == [h.strip().lower() for h in header]:
            continue
        # build properties using header names
        props = {header[i] if header[i] else f'col{i+1}': (cols[i] if cols[i] != '' else None) for i in range(len(header))}

        lat_raw = cols[lat_idx] if lat_idx < len(cols) else None
        lon_raw = cols[lon_idx] if lon_idx < len(cols) else None
        lat = normalize_num(lat_raw)
        lon = normalize_num(lon_raw)

        geom = {"type": "Point", "coordinates": [None, None]} if lat is None or lon is None else {"type": "Point", "coordinates": [lon, lat]}

        features.append({"type": "Feature", "properties": props, "geometry": geom})

    # remove any feature that is just the header row repeated (all prop values equal header names)
    def is_header_feature(f):
        props = f.get('properties', {})
        vals = [str(v).strip().lower() for v in props.values() if v is not None]
        headers_l = [h.strip().lower() for h in header if h is not None]
        # header-like if all header tokens appear among property values
        return all(h in vals for h in headers_l)

    # keep only features with valid numeric coordinates
    def has_numeric_coords(f):
        coords = f.get('geometry', {}).get('coordinates', [])
        return isinstance(coords, list) and len(coords) >= 2 and coords[0] is not None and coords[1] is not None

    features = [f for f in features if has_numeric_coords(f)]

    fc = {"type": "FeatureCollection", "features": features}
    with open(GEOJSON_PATH, 'w', encoding='utf-8') as out:
        json.dump(fc, out, ensure_ascii=False, indent=2)
    print('Wrote', GEOJSON_PATH, 'with', len(features), 'features')


if __name__ == '__main__':
    main()
