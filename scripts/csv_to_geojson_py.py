#!/usr/bin/env python3
import csv, json, re, shutil, pathlib
in_path = pathlib.Path('data/poi.csv')
out_path = pathlib.Path('data/poi.geojson')
if not in_path.exists():
    raise SystemExit('data/poi.csv not found')
# Backup existing geojson
if out_path.exists():
    bak = out_path.with_suffix('.geojson.bak')
    shutil.copy2(out_path, bak)
    print('Backed up', out_path, '->', bak)

def normalize_num(s):
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    if s.startswith("'"):
        s = s[1:]
    s = s.replace(' ', '')
    # If both dot and comma present, assume dot thousands, comma decimal
    if '.' in s and ',' in s:
        s = s.replace('.', '')
        s = s.replace(',', '.')
    else:
        s = s.replace(',', '.')
    # Remove stray non-numeric chars
    s = re.sub(r"[^0-9\.\-+eE]", '', s)
    try:
        return float(s)
    except:
        return None

features = []
with in_path.open(newline='') as f:
    reader = csv.DictReader(f, delimiter=';')
    for row in reader:
        # header names may include quotes in some exports but csv module handles it
        lat_raw = None
        lon_raw = None
        for k in ('lat','latitude','y'):
            if k in row and row[k] != '':
                lat_raw = row[k]
                break
        for k in ('lon','long','lng','x','longitude'):
            if k in row and row[k] != '':
                lon_raw = row[k]
                break
        # fallback if mislabeled
        if (not lat_raw or not lon_raw) and 'longitude' in row and 'latitude' in row:
            lat_raw = row['longitude']
            lon_raw = row['latitude']
        lat = normalize_num(lat_raw)
        lon = normalize_num(lon_raw)
        props = {k: (v if v != '' else None) for k,v in row.items() if k not in ('latitude','longitude','lat','lon','x','y')}
        if lat is None or lon is None:
            # still include feature but with nulls so missing coords are visible
            geom = { 'type': 'Point', 'coordinates': [None, None] }
        else:
            geom = { 'type': 'Point', 'coordinates': [lon, lat] }
        features.append({'type':'Feature','properties':props,'geometry':geom})

fc = {'type':'FeatureCollection','features':features}
with out_path.open('w', encoding='utf8') as f:
    json.dump(fc, f, ensure_ascii=False, indent=2)
print('Wrote', out_path, 'with', len(features), 'features')
