#!/usr/bin/env python3
import csv, pathlib

csv1 = pathlib.Path('data/data_bak.csv')
csv2 = pathlib.Path('data/poi.csv')

def read_coords(p):
    if not p.exists():
        return {}
    with p.open(newline='', encoding='utf8') as f:
        reader = csv.DictReader(f, delimiter=';')
        res = {}
        for row in reader:
            # find id
            idv = row.get('ID') or row.get('Id') or row.get('id') or ''
            idv = idv.strip() if idv is not None else ''
            # find lat/lon keys
            lat_keys = ['latitude','lat','y']
            lon_keys = ['longitude','lon','lng','x']
            lat=None
            lon=None
            for k in lat_keys:
                if k in row and row[k] != '':
                    lat = row[k]
                    break
            for k in lon_keys:
                if k in row and row[k] != '':
                    lon = row[k]
                    break
            # if not found, try swapped
            if (not lat or not lon) and 'latitude' in row and 'longitude' in row:
                # check if header order swapped
                if row['latitude'] and row['longitude']:
                    # keep as is
                    pass
            res[idv] = (lat, lon)
    return res

r1 = read_coords(csv1)
r2 = read_coords(csv2)

ids = sorted(set(list(r1.keys()) + list(r2.keys())))

diffs = []
for idv in ids:
    a = r1.get(idv)
    b = r2.get(idv)
    if a == b:
        continue
    diffs.append((idv, a, b))

if not diffs:
    print('No differences found (by ID).')
else:
    print('Differences (ID, data_bak(lat,lon), poi(lat,lon)):')
    for idv,a,b in diffs:
        print(f'- ID={idv} \n    data_bak: {a} \n    poi.csv:  {b}')
