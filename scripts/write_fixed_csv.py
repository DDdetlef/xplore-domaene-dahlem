#!/usr/bin/env python3
import csv, json
from pathlib import Path

CSV='data/poi.csv'
GEO='data/poi.geojson'
OUT='data/poi_fixed.csv'

def main(prefix_apostrophe=False):
    rows=[]
    with open(CSV, encoding='utf-8', newline='') as fh:
        r=csv.reader(fh, delimiter=';')
        for row in r:
            rows.append(row)
    if not rows:
        print('no rows')
        return
    header=rows[0]
    id_idx = None
    lat_idx = None
    lon_idx = None
    for i,h in enumerate(header):
        hn=h.strip().lower()
        if hn=='id': id_idx=i
        if hn=='latitude': lat_idx=i
        if hn=='longitude': lon_idx=i
    geo={}
    data=json.load(open(GEO, encoding='utf-8'))
    for f in data.get('features',[]):
        pid=str(f.get('properties',{}).get('ID'))
        coords=f.get('geometry',{}).get('coordinates')
        if coords and len(coords)>=2:
            geo[pid]=(coords[1], coords[0])
    out_rows=[]
    out_rows.append(header)
    for row in rows[1:]:
        rid = row[id_idx] if id_idx is not None and id_idx < len(row) else None
        if rid and rid in geo and lat_idx is not None and lon_idx is not None:
            lat,lon = geo[rid]
            lat_s = f"'{lat}" if prefix_apostrophe else f"{lat}"
            lon_s = f"'{lon}" if prefix_apostrophe else f"{lon}"
            # ensure row long enough
            while len(row) <= max(lat_idx, lon_idx): row.append('')
            row[lat_idx]=lat_s
            row[lon_idx]=lon_s
        out_rows.append(row)
    with open(OUT, 'w', encoding='utf-8', newline='') as fh:
        w=csv.writer(fh, delimiter=';', quoting=csv.QUOTE_MINIMAL)
        for r in out_rows:
            w.writerow(r)
    print('Wrote', OUT, 'with', len(out_rows)-1, 'rows')

if __name__=='__main__':
    import sys
    prefix = '--excel' in sys.argv or '-e' in sys.argv
    main(prefix_apostrophe=prefix)
