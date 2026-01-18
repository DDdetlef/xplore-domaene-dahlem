#!/usr/bin/env python3
import csv, json
from pathlib import Path

CSV='data/poi.csv'
GEO='data/poi.geojson'

def read_csv():
    rows={}
    with open(CSV, encoding='utf-8') as fh:
        r=csv.DictReader(fh, delimiter=';')
        for row in r:
            rows[row.get('ID')]=row
    return rows

def read_geo():
    d=json.load(open(GEO, encoding='utf-8'))
    rows={}
    for f in d.get('features',[]):
        pid=str(f.get('properties',{}).get('ID'))
        geom=f.get('geometry',{})
        coords=geom.get('coordinates') if geom else None
        rows[pid]=coords
    return rows

csvm=read_csv()
geom=read_geo()

for pid in sorted(set(list(csvm.keys())+list(geom.keys())), key=lambda x: int(x) if x and x.isdigit() else x):
    c=csvm.get(pid)
    g=geom.get(pid)
    lat_csv=c.get('latitude') if c else None
    lon_csv=c.get('longitude') if c else None
    if g:
        lon_geo,lat_geo=g[0],g[1]
    else:
        lon_geo,lat_geo=None,None
    if str(lat_csv) != str(lat_geo) or str(lon_csv) != str(lon_geo):
        print(f'ID {pid}: CSV lat={lat_csv!r} lon={lon_csv!r}  GEO lat={lat_geo!r} lon={lon_geo!r}')

print('done')
