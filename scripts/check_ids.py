#!/usr/bin/env python3
import csv, json
def main():
    ids=('4','5','6')
    csvm={}
    with open('data/poi.csv', encoding='utf-8') as fh:
        r=csv.DictReader(fh, delimiter=';')
        for row in r:
            if row.get('ID') in ids:
                csvm[row['ID']]=row
    j=json.load(open('data/poi.geojson', encoding='utf-8'))
    geom={}
    for f in j.get('features',[]):
        pid=str(f.get('properties',{}).get('ID'))
        geom[pid]=f.get('geometry',{}).get('coordinates')
    for i in ids:
        print('ID',i)
        print(' CSV lat=', csvm.get(i,{}).get('latitude'))
        print(' CSV lon=', csvm.get(i,{}).get('longitude'))
        print(' GEO coords=', geom.get(i))

if __name__=='__main__':
    main()
